import {
  BehaviorSubject,
  firstValueFrom,
  type Observable,
  type Subscription,
  takeWhile,
} from "rxjs";

import {
  type App,
  type Applied,
  applyChangeSet,
  type Catalog,
  type GenerationEvent,
  GenerationRequest,
  type Ontology,
  type Problem,
  type Proposal,
  validateApp,
} from "@origamic/spec";

import type { LlmGatewayPort } from "#/ports/llmGatewayPort.ts";
import type { OntologyStorePort } from "#/ports/ontologyStorePort.ts";
import type { SpecLibraryPort } from "#/ports/specLibraryPort.ts";
import type { WorkspacePresenter } from "#/workspace/workspacePresenter.ts";

import { describeChangeSet } from "./describeChangeSet.ts";
import { type AppDiff, diffApps } from "./diffApps.ts";

/** What the builder works on: a new app, or the app pinned in a panel. */
type BuilderTarget =
  | { kind: "new" }
  | { kind: "revise"; panel: string; app: App };

/** Where the builder's conversation with the model stands (ADR-0012). */
export type BuilderState =
  | { kind: "idle"; target: BuilderTarget }
  | { kind: "generating"; target: BuilderTarget; progress: readonly string[] }
  | {
      kind: "proposed";
      target: BuilderTarget;
      proposal: Proposal;
      /** One line per operation of the change set (`describeChangeSet`). */
      changes: readonly string[];
      diff: AppDiff;
    }
  | { kind: "accepting"; target: BuilderTarget }
  | {
      kind: "failed";
      target: BuilderTarget;
      message: string;
      problems: readonly Problem[];
    };

/**
 * The builder: asks the model for a proposal, shows it, and accepts or
 * rejects it. A proposal is a value here until it is accepted; nothing is
 * stored before (ADR-0012).
 */
export interface Builder {
  state(): Observable<BuilderState>;
  /** Works on another target from now on, dropping a generation or a proposal. Ignored while accepting. */
  target(target: BuilderTarget): void;
  /** Asks the model for a proposal for the target, dropping one asked before. Ignored while accepting. */
  ask(intent: string): void;
  /**
   * Accepts the proposal: applies its change set first, then saves the
   * app, then adds a panel for a new app or moves the panel's pin for a
   * revision (ADR-0012). Nothing is stored when the ontology has moved since
   * the proposal was made, or when the app does not check against the
   * ontology the change set yields. Does nothing unless a proposal is shown.
   * Then the builder is idle, on the saved version for a revision and on a
   * new app otherwise.
   */
  accept(): Promise<void>;
  /** Drops the proposal, or a generation or a failure, and stores nothing. Ignored while accepting. */
  reject(): void;
  /**
   * Forgets the owner's conversation, as when another signs in or the owner
   * signs out: what is generated or proposed is dropped, an accept under
   * way stores nothing more (it ends saying it was stopped), and the
   * builder is idle on a new app. Unlike `target`, it is not ignored while
   * accepting.
   */
  close(): void;
}

/** What the builder works through. */
export interface BuilderPorts {
  ontology: OntologyStorePort;
  library: SpecLibraryPort;
  llm: LlmGatewayPort;
  catalog: Catalog;
  workspace: WorkspacePresenter;
}

export function createBuilder(ports: BuilderPorts): Builder {
  const state = new BehaviorSubject<BuilderState>({
    kind: "idle",
    target: { kind: "new" },
  });
  let generation: Subscription | undefined;
  /** Counts the asks, so the ontology read for one that was dropped starts nothing. */
  let asked = 0;
  /** Counts the closes: an accept that began before one stores nothing more. */
  let owners = 0;

  function show(next: BuilderState): void {
    state.next(next);
  }

  /** Stops what is running and drops what is shown, unless an accept is under way. */
  function drop(): BuilderTarget | undefined {
    const current = state.getValue();

    if (current.kind === "accepting") {
      return undefined;
    }

    asked += 1;
    generation?.unsubscribe();
    generation = undefined;

    return current.target;
  }

  async function generate(
    ask: number,
    intent: string,
    target: BuilderTarget,
  ): Promise<void> {
    const ontology = await firstValueFrom(ports.ontology.current());

    if (ask !== asked) {
      return;
    }

    const request = GenerationRequest.safeParse({
      format: 1,
      intent,
      ontology,
      ...(target.kind === "revise" ? { app: target.app } : {}),
    });

    if (!request.success) {
      show(
        failed(
          target,
          "The request could not be sent.",
          request.error.issues.map((issue) => {
            return { path: issue.path.join("."), message: issue.message };
          }),
        ),
      );

      return;
    }

    let progress: readonly string[] = [];
    let ended = false;

    /** Whether this generation still owns the state: not dropped, and not ended. */
    function owns(): boolean {
      return ask === asked && !ended;
    }

    generation = ports.llm
      .generate(request.data)
      .pipe(
        // A generation ends at its first proposal or failure; what follows is not read.
        takeWhile((event) => {
          return event.kind === "progress";
        }, true),
      )
      .subscribe({
        next: (event: GenerationEvent): void => {
          if (!owns()) {
            return;
          }

          if (event.kind === "progress") {
            progress = [...progress, event.message];
            show({ kind: "generating", target, progress });

            return;
          }

          ended = true;
          show(
            event.kind === "proposal"
              ? proposed(target, event.proposal, ontology)
              : failed(target, event.message, event.problems),
          );
        },
        error: (error: unknown): void => {
          if (owns()) {
            ended = true;
            show(failed(target, messageOf(error), []));
          }
        },
        complete: (): void => {
          if (owns()) {
            ended = true;
            show(
              failed(target, "The generation ended without a proposal.", []),
            );
          }
        },
      });
  }

  /** Whether the owner the accept began for is still the builder's. Read right before each store, with no await between. */
  function stillOwned(accepting: Accepting): boolean {
    return accepting.owner === owners;
  }

  async function store(
    target: BuilderTarget,
    proposal: Proposal,
    accepting: Accepting,
  ): Promise<BuilderState> {
    const ontology = await firstValueFrom(ports.ontology.current());
    const checked = await check(ports, target, proposal, ontology);

    if (checked.kind === "failed") {
      return checked;
    }

    let moved: string | undefined;

    if (!stillOwned(accepting)) {
      return stopped();
    }

    if (proposal.changeSet !== null) {
      const applied = await ports.ontology.apply(proposal.changeSet);

      // It applied to the ontology `check` read, so the store's has moved since.
      if (applied.kind !== "applied") {
        return failed(
          target,
          STALE,
          applied.kind === "invalid" ? applied.problems : [],
        );
      }

      moved = `The ontology moved to v${applied.ontology.version}`;
    }

    if (!stillOwned(accepting)) {
      return stopped();
    }

    let app: App;

    try {
      app = await ports.library.saveApp(checked.app);
    } catch (error: unknown) {
      return failed(
        target,
        moved === undefined
          ? messageOf(error)
          : `${moved}, but the app was not saved: ${messageOf(error)}`,
        [],
      );
    }

    try {
      if (target.kind === "revise") {
        await ports.workspace.movePin(target.panel, app, accepting.asOf);

        return { kind: "idle", target: { ...target, app } };
      }

      await ports.workspace.addPanel(app, accepting.asOf);

      return { kind: "idle", target };
    } catch (error: unknown) {
      const panel =
        target.kind === "revise"
          ? `the panel "${target.panel}" was not moved to it`
          : "no panel was added";

      return failed(
        target,
        `Saved ${app.id}@${app.version}, but ${panel}: ${messageOf(error)}`,
        [],
      );
    }
  }

  return {
    state: (): Observable<BuilderState> => {
      return state.asObservable();
    },
    target: (target: BuilderTarget): void => {
      if (drop() !== undefined) {
        show({ kind: "idle", target });
      }
    },
    ask: (intent: string): void => {
      const target = drop();

      if (target === undefined) {
        return;
      }

      const ask = asked;

      show({ kind: "generating", target, progress: [] });
      // `ask` answers through the state, so nothing waits here; a failure is
      // shown as one, unless the ask was dropped since.
      void generate(ask, intent, target).catch((error: unknown) => {
        if (ask === asked) {
          show(failed(target, messageOf(error), []));
        }
      });
    },
    accept: async (): Promise<void> => {
      const current = state.getValue();

      if (current.kind !== "proposed") {
        return;
      }

      const { target, proposal } = current;
      const accepting: Accepting = {
        owner: owners,
        asOf: ports.workspace.epoch(),
      };

      show({ kind: "accepting", target });

      let outcome: BuilderState;

      try {
        outcome = await store(target, proposal, accepting);
      } catch (error: unknown) {
        outcome = failed(target, messageOf(error), []);
      }

      show(stillOwned(accepting) ? outcome : stopped());
    },
    reject: (): void => {
      const target = drop();

      if (target !== undefined) {
        show({ kind: "idle", target });
      }
    },
    close: (): void => {
      owners += 1;
      asked += 1;
      generation?.unsubscribe();
      generation = undefined;
      show({ kind: "idle", target: { kind: "new" } });
    },
  };
}

/** What an accept began for one owner and closed under it saw: the owner, and the workspace's epoch, when it began. */
interface Accepting {
  owner: number;
  asOf: number;
}

const STOPPED =
  "The accept was stopped: who is signed in changed before it was saved, and nothing more was saved.";

/** An accept that its owner's sign-out or another's sign-in stopped: the builder is on a new app, and says so. */
function stopped(): Failed {
  return failed({ kind: "new" }, STOPPED, []);
}

const STALE =
  "Nothing was saved: the ontology changed since this proposal was made. Ask again.";

type Failed = Extract<BuilderState, FailedKind>;

interface FailedKind {
  kind: "failed";
}

type Checked = { kind: "checked"; app: Proposal["app"] } | Failed;

/**
 * What can be found before anything is stored: the ontology moved since the
 * proposal, a change set it refuses, an app that does not check against
 * the ontology the change set yields, or an app that is not the target's.
 */
async function check(
  ports: BuilderPorts,
  target: BuilderTarget,
  proposal: Proposal,
  ontology: Ontology,
): Promise<Checked> {
  const applied: Applied =
    proposal.changeSet === null
      ? { kind: "applied", ontology }
      : applyChangeSet(ontology, proposal.changeSet);

  if (applied.kind === "stale") {
    return failed(target, STALE, []);
  }

  if (applied.kind === "invalid") {
    return failed(
      target,
      "The change set does not apply to the ontology.",
      applied.problems,
    );
  }

  if (proposal.app.ontologyVersion !== applied.ontology.version) {
    return failed(target, STALE, []);
  }

  const validated = validateApp(proposal.app, applied.ontology, ports.catalog);

  if (validated.kind === "invalid") {
    return failed(
      target,
      "The app does not check against the ontology.",
      validated.problems,
    );
  }

  const { id } = validated.app;

  if (target.kind === "revise" && id !== target.app.id) {
    return failed(
      target,
      `The proposal is an app "${id}", not a revision of "${target.app.id}".`,
      [],
    );
  }

  if (target.kind === "new" && (await ports.library.loadApp(id)) !== null) {
    return failed(target, await alreadySaved(ports, id), []);
  }

  return { kind: "checked", app: validated.app };
}

/** Where to revise an app the library has: in the panel that pins it, or, when none does, after opening it from the library. */
async function alreadySaved(ports: BuilderPorts, id: string): Promise<string> {
  const workspace = await firstValueFrom(ports.workspace.workspace());
  const pinned = Object.entries(workspace?.panels ?? {}).find(([, panel]) => {
    return panel.app === id;
  });

  return pinned === undefined
    ? `The library has an app "${id}" already: open it from the library and revise it there.`
    : `The library has an app "${id}" already, in the panel "${pinned[0]}": revise it there.`;
}

function proposed(
  target: BuilderTarget,
  proposal: Proposal,
  ontology: Ontology,
): BuilderState {
  return {
    kind: "proposed",
    target,
    proposal,
    changes:
      proposal.changeSet === null
        ? []
        : describeChangeSet(proposal.changeSet, ontology),
    diff: diffApps(target.kind === "revise" ? target.app : null, proposal.app),
  };
}

function failed(
  target: BuilderTarget,
  message: string,
  problems: readonly Problem[],
): Failed {
  return { kind: "failed", target, message, problems };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
