import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  type GenerationEvent,
  GenerationRequest,
  type Problem,
} from "@origamic/spec";

import { generate } from "./generate.ts";
import type { ModelClient } from "./model.ts";

/** Who sent a token: a user Supabase knows, or a token it refused. */
export type Caller = { kind: "user"; id: string } | { kind: "refused" };

/** Checks a caller's token with the issuer. It rejects only when the issuer cannot be asked. */
export type VerifyCaller = (token: string) => Promise<Caller>;

export interface GatewayDeps {
  verify: VerifyCaller;
  model: ModelClient;
  /** The one origin a browser may call the gateway from: the web app's. */
  allowedOrigin: string;
  /** How long one generation may take in all; `generate`'s default when left out. */
  deadlineMs?: number;
}

/** The events of one generation, as the server streams them. `signal` is aborted when the caller has gone. */
type Generation = (
  request: GenerationRequest,
  signal: AbortSignal,
) => AsyncIterable<GenerationEvent>;

export interface GenerationServerDeps {
  verify: VerifyCaller;
  generate: Generation;
  allowedOrigin: string;
}

/**
 * The gateway's HTTP server: `POST /generate` only. A caller sends a
 * Supabase access token and a `GenerationRequest`; the server answers with
 * the generation's events as NDJSON, one `GenerationEvent` a line. Every
 * refusal is a `failed` event too, as JSON, so the client reads one shape.
 */
export function createGatewayServer(deps: GatewayDeps): Server {
  return createGenerationServer({
    verify: deps.verify,
    allowedOrigin: deps.allowedOrigin,
    generate: (
      request: GenerationRequest,
      signal: AbortSignal,
    ): AsyncIterable<GenerationEvent> => {
      return generate(request, deps.model, {
        signal,
        deadlineMs: deps.deadlineMs,
      });
    },
  });
}

/** The server over any generation: the gateway's, or, for the port's contract, one that replays the events it is given. */
export function createGenerationServer(deps: GenerationServerDeps): Server {
  return createServer((request, response) => {
    // Node's request handler waits for nothing; `serve` answers every
    // failure itself, and the catch ends a response it could not.
    void serve(deps, request, response).catch(() => {
      response.destroy();
    });
  });
}

/** The most a request may carry: an ontology and an app are small. */
const MAX_BODY_BYTES = 2_000_000;

async function serve(
  deps: GenerationServerDeps,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const allowed = request.headers.origin === deps.allowedOrigin;

  if (allowed) {
    response.setHeader("access-control-allow-origin", deps.allowedOrigin);
  }

  response.setHeader("vary", "origin");

  if (new URL(request.url ?? "/", "http://gateway").pathname !== "/generate") {
    refuse(
      response,
      404,
      "There is nothing here; the gateway serves POST /generate.",
    );

    return;
  }

  if (request.method === "OPTIONS") {
    if (allowed) {
      response.setHeader("access-control-allow-methods", "POST");
      response.setHeader(
        "access-control-allow-headers",
        "authorization, content-type",
      );
      response.setHeader("access-control-max-age", "600");
    }

    response.writeHead(204).end();

    return;
  }

  if (request.method !== "POST") {
    response.setHeader("allow", "POST, OPTIONS");
    refuse(response, 405, "The gateway takes a POST to /generate.");

    return;
  }

  await serveGeneration(deps, request, response);
}

async function serveGeneration(
  deps: GenerationServerDeps,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const token = bearerOf(request.headers.authorization);

  if (token === undefined) {
    refuse(response, 401, "Sign in to generate: the request has no token.");

    return;
  }

  const caller = await callerOf(deps.verify, token);

  if (caller === undefined) {
    refuse(
      response,
      502,
      "The gateway could not check the token. Try again in a moment.",
    );

    return;
  }

  if (caller.kind === "refused") {
    refuse(
      response,
      401,
      "The token is not one Supabase accepts: sign in again.",
    );

    return;
  }

  const body = await bodyOf(request);

  if (body === undefined) {
    refuse(response, 413, "The request is larger than any generation request.");

    return;
  }

  const json = jsonOf(body);

  if (json === NOT_JSON) {
    refuse(response, 400, "The request is not JSON.");

    return;
  }

  const parsed = GenerationRequest.safeParse(json);

  if (!parsed.success) {
    refuse(
      response,
      400,
      "The request is not a generation request.",
      parsed.error.issues.map((issue): Problem => {
        return {
          path: issue.path.map(String).join("."),
          message: issue.message,
        };
      }),
    );

    return;
  }

  // The caller may leave while the model is still asked: abort that call,
  // rather than pay for a reply nobody reads.
  const left = new AbortController();

  response.on("close", () => {
    left.abort();
  });

  await stream(deps.generate(parsed.data, left.signal), response);
}

/**
 * Writes each event as it comes, one a line, and stops asking for more when
 * the caller has gone. A generation that throws ends with a `failed` line,
 * so the caller is never left with a stream that stops without a word.
 */
async function stream(
  events: AsyncIterable<GenerationEvent>,
  response: ServerResponse,
): Promise<void> {
  response.writeHead(200, {
    "content-type": "application/x-ndjson",
    "cache-control": "no-store",
  });

  try {
    for await (const event of events) {
      if (response.destroyed) {
        break;
      }

      response.write(line(event));
    }
  } catch {
    response.write(
      line({
        kind: "failed",
        message: "The gateway failed while generating. Try again.",
        problems: [],
      }),
    );
  }

  response.end();
}

function line(event: GenerationEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function refuse(
  response: ServerResponse,
  status: number,
  message: string,
  problems: Problem[] = [],
): void {
  const event: GenerationEvent = { kind: "failed", message, problems };

  response
    .writeHead(status, { "content-type": "application/json" })
    .end(JSON.stringify(event));
}

function bearerOf(header: string | undefined): string | undefined {
  const match = /^Bearer (\S+)$/.exec(header ?? "");

  return match?.[1];
}

/** The caller, or undefined when the issuer could not be asked. */
async function callerOf(
  verify: VerifyCaller,
  token: string,
): Promise<Caller | undefined> {
  try {
    return await verify(token);
  } catch {
    return undefined;
  }
}

/** The body as text, or undefined once it passes the limit. */
async function bodyOf(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    if (!Buffer.isBuffer(chunk)) {
      throw new TypeError("a request body chunk is not bytes");
    }

    size += chunk.length;

    if (size > MAX_BODY_BYTES) {
      return undefined;
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

const NOT_JSON = Symbol("not JSON");

function jsonOf(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return NOT_JSON;
  }
}
