import { randomUUID } from "node:crypto";

import {
  catalog,
  generationSchema,
  readGenerated,
} from "@origamic/catalog/manifest";
import {
  type Applied,
  applyChangeSet,
  type ChangeSet,
  type GenerationEvent,
  type GenerationRequest,
  type Problem,
  type Proposal,
  validateApp,
} from "@origamic/spec";

import type {
  ModelClient,
  ModelMessage,
  ModelReply,
  ModelRequest,
} from "./model.ts";
import { requestMessage, retryMessage, SYSTEM_PROMPT } from "./prompt.ts";
import { resolveBindings } from "./resolveBindings.ts";

/** How many times a reply with problems goes back to the model (ADR-0011). */
const RETRIES = 1;

/** How long a generation may take, every call to the model in it together, unless it is given its own deadline. */
const DEFAULT_DEADLINE_MS = 5 * 60 * 1000;

export interface GenerateOptions {
  /** Aborted when the caller has gone: the model call in flight is aborted, and nothing more is said. */
  signal?: AbortSignal;
  /** How long the generation may take in all. Past it, the model call is aborted and the generation fails. */
  deadlineMs?: number;
}

/**
 * One generation's events: its progress, then one proposal or one failure.
 *
 * The model is asked once. Its reply is read with the catalog's schema; its
 * operations become a change set against the request's ontology, applied to
 * get the ontology the app will run on; each type and action it named is
 * bound at its version there; a new app gets a fresh id, a revision the id
 * it revises; and `validateApp` checks the whole. Problems at any step go
 * back to the model once, quoted with their paths, and a second reply with
 * problems is a failure that carries them. A refusal, a reply cut short and
 * a model that cannot be reached are failures at once, and so is a
 * generation that passes its deadline.
 */
export async function* generate(
  request: GenerationRequest,
  model: ModelClient,
  options: GenerateOptions = {},
): AsyncGenerator<GenerationEvent> {
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const stop = new AbortController();
  const timer = setTimeout(() => {
    stop.abort(PAST_DEADLINE);
  }, deadlineMs);

  function leave(): void {
    stop.abort(CALLER_LEFT);
  }

  options.signal?.addEventListener("abort", leave);

  try {
    yield* attempts(request, model, stop.signal, deadlineMs);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", leave);
  }
}

const PAST_DEADLINE = "past the deadline";
const CALLER_LEFT = "the caller left";

async function* attempts(
  request: GenerationRequest,
  model: ModelClient,
  signal: AbortSignal,
  deadlineMs: number,
): AsyncGenerator<GenerationEvent> {
  const schema = generationSchema();
  const messages: ModelMessage[] = [
    { role: "user", content: requestMessage(request) },
  ];
  let problems: Problem[] = [];

  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    yield progress(
      attempt === 0
        ? "Asking the model for a change set and an app"
        : "Asking the model again, with what was wrong",
    );

    const reply = await replyOf(
      model,
      { system: SYSTEM_PROMPT, messages: [...messages], schema },
      signal,
    );

    if (reply.kind === "stopped") {
      if (signal.reason === PAST_DEADLINE) {
        yield failed(
          `The model took longer than ${Math.round(deadlineMs / 1000)} seconds to answer. Ask again, perhaps for less at once.`,
          [],
        );
      }

      return;
    }

    if (reply.kind !== "json") {
      yield failed(whyNoReply(reply), []);

      return;
    }

    yield progress("Checking the reply against the ontology and the catalog");

    const checked = proposalFrom(reply.value, request);

    if (checked.kind === "proposal") {
      yield { kind: "proposal", proposal: checked.proposal };

      return;
    }

    problems = checked.problems;
    messages.push({
      role: "user",
      content: retryMessage(reply.value, problems),
    });
  }

  yield failed(
    "The model's reply still has problems after one retry.",
    problems,
  );
}

type Checked =
  | { kind: "proposal"; proposal: Proposal }
  | { kind: "invalid"; problems: Problem[] };

/** The proposal a reply makes, or every problem that stops it at the first step that finds any. */
function proposalFrom(value: unknown, request: GenerationRequest): Checked {
  const read = readGenerated(value);

  if (read.kind === "invalid") {
    return read;
  }

  const { explanation, operations, app } = read.generated;
  const changeSet: ChangeSet | null =
    operations === null
      ? null
      : { format: 1, baseVersion: request.ontology.version, operations };

  const after: Applied =
    changeSet === null
      ? { kind: "applied", ontology: request.ontology }
      : applyChangeSet(request.ontology, changeSet);

  if (after.kind !== "applied") {
    return { kind: "invalid", problems: problemsOf(after) };
  }

  const resolved = resolveBindings(app, after.ontology);

  if (resolved.kind === "unknown") {
    return { kind: "invalid", problems: resolved.problems };
  }

  const validated = validateApp(
    {
      format: 1,
      id: request.app?.id ?? randomUUID(),
      name: app.name,
      ontologyVersion: after.ontology.version,
      bindings: resolved.bindings,
      ui: app.ui,
    },
    after.ontology,
    catalog,
  );

  return validated.kind === "valid"
    ? {
        kind: "proposal",
        proposal: { explanation, changeSet, app: validated.app },
      }
    : validated;
}

interface AppliedKind {
  kind: "applied";
}

type NotApplied = Exclude<Applied, AppliedKind>;

/** A change set written against the request's own version is never stale; were it, that is a problem too. */
function problemsOf(after: NotApplied): Problem[] {
  return after.kind === "invalid"
    ? after.problems
    : [
        {
          path: "operations",
          message: `the change set was written against an older ontology; it is at ${after.current}`,
        },
      ];
}

interface JsonKind {
  kind: "json";
}

type NoUsableReply = Exclude<ModelReply, JsonKind> | Unreachable;

interface Unreachable {
  kind: "unreachable";
}

/** The generation was stopped while the model was asked: its deadline passed, or its caller left. */
interface Stopped {
  kind: "stopped";
}

/** The model's reply; that it could not be reached, a failure to say, not to throw; or that the generation was stopped first. */
async function replyOf(
  model: ModelClient,
  request: ModelRequest,
  signal: AbortSignal,
): Promise<ModelReply | Unreachable | Stopped> {
  let reply: ModelReply | Unreachable | Stopped;

  try {
    reply = await Promise.race([
      model.complete(request, signal),
      whenAborted(signal),
    ]);
  } catch {
    reply = { kind: "unreachable" };
  }

  // Once stopped, what the aborted call says (an abort error, most likely)
  // is not the model's answer.
  return signal.aborted ? { kind: "stopped" } : reply;
}

function whenAborted(signal: AbortSignal): Promise<Stopped> {
  return new Promise<Stopped>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        resolve({ kind: "stopped" });
      },
      { once: true },
    );
  });
}

function whyNoReply(reply: NoUsableReply): string {
  switch (reply.kind) {
    case "refused":
      return reply.category === null
        ? "The model declined to answer."
        : `The model declined to answer (${reply.category}).`;
    case "cut":
      return `The model's reply was cut short (${reply.reason}).`;
    case "unavailable":
      return `The model could not be reached (${reply.reason}). Try again in a moment.`;
    case "rejected":
      return `The model's provider refused the request (${reply.reason}): the gateway is misconfigured, or the request is one it does not take.`;
    case "unreachable":
      return "The model could not be reached. Try again in a moment.";
  }
}

function progress(message: string): GenerationEvent {
  return { kind: "progress", message };
}

function failed(message: string, problems: Problem[]): GenerationEvent {
  return { kind: "failed", message, problems };
}
