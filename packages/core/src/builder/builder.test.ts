import {
  concat,
  EMPTY,
  filter,
  finalize,
  firstValueFrom,
  NEVER,
  type Observable,
  of,
  Subject,
  throwError,
} from "rxjs";
import { describe, expect, it, type MockInstance, vi } from "vitest";

import {
  type App,
  ChangeSet,
  type GenerationEvent,
  type GenerationRequest,
  Ontology,
  type Problem,
  Proposal,
} from "@origamic/spec";
import {
  createBookApp,
  createBookChange,
  createBookOntology,
  createDateFinishedApp,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

import { collect } from "#/ports/__contracts__/emissions.ts";
import { type CoreHarness, createCoreHarness } from "#/testing/coreHarness.ts";

import type { BuilderState } from "./builder.ts";

describe("the builder", () => {
  it("asking shows the progress, then the proposal with its changes and its diff", async () => {
    const { core } = createCoreHarness({ replies: [createNewBookReply()] });
    const states = collect(core.builder.state());

    core.builder.ask("a tracker for the books I'm reading");
    const proposed = await until(core, "proposed");

    expect(
      states.emissions.map((state) => {
        return state.kind === "generating" ? state.progress : state.kind;
      }),
    ).toEqual([
      "idle",
      [],
      ["Reading your ontology"],
      ["Reading your ontology", "Writing the app"],
      "proposed",
    ]);
    expect(proposed.changes).toContain(
      "Book: add type with title, author, status, rating",
    );
    expect(proposed.diff.added).toContain("element table");
    states.stop();
  });

  it("accepting a new app applies the change set, saves app version 1 and adds a panel", async () => {
    const harness = createCoreHarness({ replies: [createNewBookReply()] });
    const { core, deps } = harness;
    const apply = vi.spyOn(deps.ontology, "apply");
    const saveApp = vi.spyOn(deps.library, "saveApp");
    const saveWorkspace = vi.spyOn(deps.library, "saveWorkspace");

    await core.workspace.open();
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
    expect((await firstValueFrom(deps.ontology.current())).version).toBe(1);
    expect(await deps.library.loadApp("books")).toMatchObject({ version: 1 });
    expect(await firstValueFrom(core.workspace.workspace())).toMatchObject({
      panels: { books: { app: "books", appVersion: 1 } },
    });
    expect(callOrder(apply)).toBeLessThan(callOrder(saveApp));
    expect(callOrder(saveApp)).toBeLessThan(callOrder(saveWorkspace));
  });

  it("accepting a revision saves version 2, moves the pin, and version 1 still loads", async () => {
    const { core } = createCoreHarness({
      replies: [createNewBookReply(), createDateFinishedReply()],
    });

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();
    core.builder.target({
      kind: "revise",
      panel: "books",
      app: await loadedApp(core, 1),
    });
    core.builder.ask("add a 'date finished' field");

    const proposed = await until(core, "proposed");

    expect(proposed.changes).toContain(
      "Book: add dateFinished (date, optional)",
    );
    expect(proposed.diff.changed).toContain("binding Book@1 → Book@2");

    await core.builder.accept();

    expect(await core.library.loadApp("books")).toMatchObject({ version: 2 });
    expect(await firstValueFrom(core.workspace.workspace())).toMatchObject({
      panels: { books: { app: "books", appVersion: 2 } },
    });
    expect(await core.loadApp("books", 1)).toMatchObject({
      app: { version: 1 },
      compatibility: { kind: "compatible" },
    });
    expect(await currentState(core)).toMatchObject({
      kind: "idle",
      target: { kind: "revise", panel: "books", app: { version: 2 } },
    });
  });

  it("accepting after the ontology moved saves nothing and says so", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [createDateFinishedReply(), createDateFinishedReply()],
    });

    core.builder.ask("add a 'date finished' field");
    await until(core, "proposed");
    await core.builder.accept();
    core.builder.target({
      kind: "revise",
      panel: "books",
      app: await loadedApp(core, 1),
    });
    core.builder.ask("add a 'date finished' field");
    await until(core, "proposed");

    const before = await firstValueFrom(core.library.apps());

    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("the ontology changed"),
    });
    expect(await firstValueFrom(core.library.apps())).toEqual(before);
    expect(before).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);
  });

  it("an app proposed with no change set, after the ontology moved, is refused too", async () => {
    const { core, deps } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [[proposal(null, createBookApp())]],
    });

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await deps.ontology.apply(ChangeSet.parse(createDateFinishedChange()));
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("the ontology changed"),
    });
    expect(await firstValueFrom(core.library.apps())).toEqual([]);
  });

  it("a failed generation shows its message and its problems", async () => {
    const problems: Problem[] = [
      { path: "ui.elements.table.props.rows", message: "a view is missing" },
    ];

    const { core } = createCoreHarness({
      replies: [
        [
          { kind: "progress", message: "Writing the app" },
          {
            kind: "failed",
            message: "The model's app did not check",
            problems,
          },
        ],
      ],
    });

    core.builder.ask("a tracker for the books I'm reading");

    expect(await until(core, "failed")).toEqual({
      kind: "failed",
      target: { kind: "new" },
      message: "The model's app did not check",
      problems,
    });
  });

  it("rejecting returns to idle and saves nothing", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
    });

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    core.builder.reject();

    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
    expect((await firstValueFrom(deps.ontology.current())).version).toBe(0);
    expect(await firstValueFrom(core.library.apps())).toEqual([]);
    expect(await firstValueFrom(core.workspace.workspace())).toBeNull();
  });

  it("an app the catalog refuses is not saved, and the ontology stays as it was", async () => {
    const harness = createCoreHarness();
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
      catalog: {
        manifest: harness.deps.catalog.manifest,
        checkElement: (id: string): Problem[] => {
          return id === "table"
            ? [{ path: "ui.elements.table.props.columns", message: "none" }]
            : [];
        },
      },
    });

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      problems: [{ path: "ui.elements.table.props.columns", message: "none" }],
    });
    expect((await firstValueFrom(deps.ontology.current())).version).toBe(0);
    expect(await firstValueFrom(core.library.apps())).toEqual([]);
  });

  it("a change set the ontology refuses is not applied", async () => {
    const { core, deps } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [
        [
          proposal(
            { ...createBookChange(), baseVersion: 1 },
            createDateFinishedApp(),
          ),
        ],
      ],
    });

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      problems: expect.arrayContaining([
        expect.objectContaining({ path: "operations.0" }),
      ]),
    });
    expect((await firstValueFrom(deps.ontology.current())).version).toBe(1);
  });

  it("a revision of another app is refused", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [[proposal(null, { ...createBookApp(), id: "films" })]],
    });

    core.builder.target({
      kind: "revise",
      panel: "books",
      app: await saveBookApp(core),
    });
    core.builder.ask("add a 'date finished' field");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message: expect.stringContaining('"films"'),
    });
    expect(await core.library.loadApp("films")).toBeNull();
  });

  it("a new app with the id of an app in the library is refused, and is to be opened from the library", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [[proposal(null, createBookApp())]],
    });

    await saveBookApp(core);
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message:
        'The library has an app "books" already: open it from the library and revise it there.',
    });
    expect(await core.library.loadApp("books", 2)).toBeNull();
  });

  it("a new app with the id of an app a panel pins is to be revised in that panel", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [[proposal(null, createBookApp())]],
    });

    await core.workspace.addPanel(await saveBookApp(core));
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message:
        'The library has an app "books" already, in the panel "books": revise it there.',
    });
  });

  it("a save that fails after the change set applied says the ontology moved", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
    });

    vi.spyOn(deps.library, "saveApp").mockRejectedValue(
      new Error("the library is offline"),
    );
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toEqual({
      kind: "failed",
      target: { kind: "new" },
      message:
        "The ontology moved to v1, but the app was not saved: the library is offline",
      problems: [],
    });
  });

  it("a save that fails with no change set shows its message as it is", async () => {
    const { core, deps } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [[proposal(null, createBookApp())]],
    });

    vi.spyOn(deps.library, "saveApp").mockRejectedValue(
      new Error("the library is offline"),
    );
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message: "the library is offline",
    });
  });

  it("an app saved whose panel could not be added says it was saved", async () => {
    const { core } = createCoreHarness({
      replies: [createNewBookReply()],
    });

    vi.spyOn(core.workspace, "addPanel").mockRejectedValue(
      new Error("the workspace is offline"),
    );
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message:
        "Saved books@1, but no panel was added: the workspace is offline",
    });
    expect(await core.library.loadApp("books", 1)).not.toBeNull();
  });

  it("a revision saved whose pin could not be moved says it was saved", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      replies: [createDateFinishedReply()],
    });

    core.builder.target({
      kind: "revise",
      panel: "books",
      app: await saveBookApp(core),
    });
    vi.spyOn(core.workspace, "movePin").mockRejectedValue(
      new Error("the workspace is offline"),
    );
    core.builder.ask("add a 'date finished' field");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message:
        'Saved books@2, but the panel "books" was not moved to it: the workspace is offline',
    });
  });

  it("a dropped ask's late failure does not change the state", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
    });
    const late = new Subject<Ontology>();
    const states = collect(core.builder.state());

    vi.spyOn(deps.ontology, "current").mockReturnValueOnce(late);
    core.builder.ask("a tracker for films");
    core.builder.target({ kind: "new" });
    late.error(new Error("too late"));
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");

    expect(
      states.emissions.filter((state) => {
        return state.kind === "failed";
      }),
    ).toEqual([]);
    states.stop();
  });

  it("what a generation sends after its proposal is not read", async () => {
    const { core, deps } = createCoreHarness();
    const [reply] = createDateFinishedReply();

    if (reply === undefined) {
      throw new Error("the date-finished reply is empty");
    }

    const after: GenerationEvent = {
      kind: "failed",
      message: "after the proposal",
      problems: [],
    };

    vi.spyOn(deps.llm, "generate").mockReturnValueOnce(
      concat(
        of(reply, after),
        throwError(() => {
          return new Error("after the proposal");
        }),
      ),
    );

    const states = collect(core.builder.state());

    core.builder.ask("add a 'date finished' field");
    await until(core, "proposed");

    expect(
      states.emissions.map((state) => {
        return state.kind;
      }),
    ).toEqual(["idle", "generating", "proposed"]);
    states.stop();
  });

  it("a generation's stream is let go once it has proposed", async () => {
    const { core, deps } = createCoreHarness();
    const [reply] = createDateFinishedReply();
    let released = false;

    if (reply === undefined) {
      throw new Error("the date-finished reply is empty");
    }

    vi.spyOn(deps.llm, "generate").mockReturnValueOnce(
      concat(of(reply), NEVER).pipe(
        finalize(() => {
          released = true;
        }),
      ),
    );
    core.builder.ask("add a 'date finished' field");
    await until(core, "proposed");

    expect(released).toBe(true);
  });

  it("a target chosen while a generation reports drops what it sends next", async () => {
    const { core, deps } = createCoreHarness();
    const [reply] = createNewBookReply();
    const [, , proposalEvent] = createNewBookReply();

    if (reply === undefined || proposalEvent === undefined) {
      throw new Error("the new-book reply is short");
    }

    vi.spyOn(deps.llm, "generate").mockReturnValueOnce(
      of(reply, proposalEvent),
    );

    const watching = core.builder.state().subscribe((state) => {
      if (state.kind === "generating" && state.progress.length > 0) {
        core.builder.target({ kind: "new" });
      }
    });

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "idle");
    watching.unsubscribe();

    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
  });

  it("a change set the store refuses at the last moment saves nothing", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
    });

    vi.spyOn(deps.ontology, "apply").mockResolvedValueOnce({
      kind: "stale",
      current: 3,
    });
    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    await core.builder.accept();

    expect(await currentState(core)).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("the ontology changed"),
    });
    expect(await firstValueFrom(core.library.apps())).toEqual([]);
  });

  it("the request carries the intent, the ontology and the app it revises", async () => {
    const { core, deps } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
    });
    const sent = hangNext(vi.spyOn(deps.llm, "generate"));
    const app = await saveBookApp(core);

    core.builder.target({ kind: "revise", panel: "books", app });
    core.builder.ask("add a 'date finished' field");

    expect(await sent).toEqual<GenerationRequest>({
      format: 1,
      intent: "add a 'date finished' field",
      ontology: Ontology.parse(createBookOntology()),
      app,
    });
  });

  it("an intent the request refuses fails at once, and asks the model nothing", async () => {
    const { core, deps } = createCoreHarness();
    const generate = vi.spyOn(deps.llm, "generate");

    core.builder.ask("");

    expect(await until(core, "failed")).toMatchObject({
      problems: [{ path: "intent" }],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("a generation that fails or ends without a proposal says so", async () => {
    const { core, deps } = createCoreHarness();
    const generate = vi.spyOn(deps.llm, "generate");

    generate.mockReturnValueOnce(
      throwError(() => {
        return "the gateway is down";
      }),
    );
    core.builder.ask("a tracker for the books I'm reading");

    expect(await until(core, "failed")).toMatchObject({
      message: "the gateway is down",
      problems: [],
    });

    generate.mockImplementationOnce(() => {
      throw new Error("no gateway is configured");
    });
    core.builder.ask("a tracker for the books I'm reading");

    expect(await until(core, "failed")).toMatchObject({
      message: "no gateway is configured",
    });

    generate.mockReturnValueOnce(EMPTY);
    core.builder.ask("a tracker for the books I'm reading");

    expect(await until(core, "failed")).toMatchObject({
      message: "The generation ended without a proposal.",
    });
  });

  it("choosing another target drops the generation and the proposal", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
    });
    const generate = vi.spyOn(deps.llm, "generate");
    const app = await saveBookApp(core);

    core.builder.ask("a tracker for the books I'm reading");
    core.builder.target({ kind: "revise", panel: "books", app });

    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "revise", panel: "books", app },
    });

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");
    core.builder.target({ kind: "new" });

    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("asking again drops the first generation", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
    });
    const sent = hangNext(vi.spyOn(deps.llm, "generate"));

    core.builder.ask("a tracker for films");
    await sent;
    core.builder.ask("a tracker for the books I'm reading");

    expect((await until(core, "proposed")).proposal.app.id).toBe("books");
  });

  it("accepting with nothing proposed does nothing, and so does a target chosen while accepting", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createNewBookReply()],
    });
    const apply = vi.spyOn(deps.ontology, "apply");

    await core.builder.accept();

    expect(apply).not.toHaveBeenCalled();

    core.builder.ask("a tracker for the books I'm reading");
    await until(core, "proposed");

    const accepting = core.builder.accept();

    expect(await currentState(core)).toEqual({
      kind: "accepting",
      target: { kind: "new" },
    });

    core.builder.target({ kind: "new" });
    core.builder.ask("another");
    core.builder.reject();
    await accepting;

    expect(await currentState(core)).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
    expect(apply).toHaveBeenCalledOnce();
  });
});

type Kind = BuilderState["kind"];
type Core = CoreHarness["core"];

interface OfKind<K extends Kind> {
  kind: K;
}

type StateOf<K extends Kind> = Extract<BuilderState, OfKind<K>>;

interface CallRecord {
  invocationCallOrder: readonly number[];
}

interface Called {
  mock: CallRecord;
}

/** The builder's state once it is of `kind`. */
function until<K extends Kind>(core: Core, kind: K): Promise<StateOf<K>> {
  return firstValueFrom(
    core.builder.state().pipe(
      filter((state): state is StateOf<K> => {
        return state.kind === kind;
      }),
    ),
  );
}

function currentState(core: Core): Promise<BuilderState> {
  return firstValueFrom(core.builder.state());
}

/** When a spied function was last called, as vitest counts calls across every mock. */
function callOrder(spy: Called): number {
  return spy.mock.invocationCallOrder.at(-1) ?? Number.NaN;
}

type Generate = (request: GenerationRequest) => Observable<GenerationEvent>;

/** Makes the next generation run forever, and resolves with its request once the builder sends it. */
function hangNext(
  generate: MockInstance<Generate>,
): Promise<GenerationRequest> {
  return new Promise((resolve) => {
    generate.mockImplementationOnce((request: GenerationRequest) => {
      resolve(request);

      return NEVER;
    });
  });
}

async function loadedApp(core: Core, version: number): Promise<App> {
  const app = await core.library.loadApp("books", version);

  if (app === null) {
    throw new Error(`the library has no "books" at version ${version}`);
  }

  return app;
}

/** The book tracker saved straight into the library, at version 1. */
async function saveBookApp(core: Core): Promise<App> {
  return core.library.saveApp(
    Proposal.parse({
      explanation: "",
      changeSet: null,
      app: createBookApp(),
    }).app,
  );
}

/** The model's reply to slice step 1: a book type, its two actions, and the book tracker. */
function createNewBookReply(): GenerationEvent[] {
  return [
    { kind: "progress", message: "Reading your ontology" },
    { kind: "progress", message: "Writing the app" },
    proposal(createBookChange(), createBookApp()),
  ];
}

/** The model's reply to slice step 7. */
function createDateFinishedReply(): GenerationEvent[] {
  return [proposal(createDateFinishedChange(), createDateFinishedApp())];
}

function proposal(changeSet: unknown, app: unknown): GenerationEvent {
  return {
    kind: "proposal",
    proposal: Proposal.parse({ explanation: "As asked.", changeSet, app }),
  };
}
