import {
  defer,
  filter,
  firstValueFrom,
  NEVER,
  type Observable,
  Subject,
} from "rxjs";
import { describe, expect, it, vi } from "vitest";

import {
  App,
  AppDraft,
  type GenerationEvent,
  Ontology,
  Proposal,
  type Workspace,
} from "@origamic/spec";
import {
  createBookApp,
  createBookChange,
  createBookOntology,
} from "@origamic/spec/testing/bookTracker.ts";

import type { BuilderState } from "./builder/builder.ts";
import type { Core } from "./createCore.ts";
import { collect } from "./ports/__contracts__/emissions.ts";
import type { User } from "./ports/sessionPort.ts";
import { createSessionSimulator } from "./simulators/sessionSimulator.ts";
import { createCoreHarness } from "./testing/coreHarness.ts";
import { createStoresPerOwner } from "./testing/storesPerOwner.ts";

describe("createCore", () => {
  it("an owner with nothing yet has no apps and no workspaces", async () => {
    const { core } = createCoreHarness();

    expect(await firstValueFrom(core.library.apps())).toEqual([]);
    expect(await firstValueFrom(core.library.workspaces())).toEqual([]);
  });

  it("loading an app built against the current ontology finds it compatible", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
    });

    await core.library.saveApp(AppDraft.parse(createBookApp()));

    expect(await core.loadApp("books", 1)).toEqual({
      app: { ...AppDraft.parse(createBookApp()), version: 1 },
      compatibility: { kind: "compatible" },
    });
  });

  it("loading an app that uses a property the ontology deprecated gives a report, not an error", async () => {
    const { core } = createCoreHarness({
      ontology: createOntologyWithAuthorDeprecated(),
    });

    await core.library.saveApp(AppDraft.parse(createBookApp()));

    expect(await core.loadApp("books", 1)).toMatchObject({
      app: { version: 1 },
      compatibility: {
        kind: "report",
        breaks: expect.arrayContaining([
          { binding: "Book@1", property: "author", reason: "deprecated" },
        ]),
      },
    });
  });

  it("loading a version the library does not have gives null", async () => {
    const { core } = createCoreHarness();

    expect(await core.loadApp("books", 1)).toBeNull();
  });

  it("signing in goes through the session it was given", async () => {
    const { core } = createCoreHarness({
      accounts: [{ email: "reader@example.com", password: "a password" }],
    });

    await core.session.signIn("reader@example.com", "a password");

    expect(await firstValueFrom(core.session.user())).toMatchObject({
      email: "reader@example.com",
    });
  });

  it("a sign-in opens the owner's workspace, and the core gives it as theirs", async () => {
    const { core } = createCoreHarness();

    await core.session.signUp(READER, PASSWORD);

    expect(await opened(core)).toMatchObject({ id: "main", version: 1 });
    expect(await current(core.workspaceProblem())).toBeNull();
  });

  it("gives no workspace while nobody is signed in, even one the presenter has open", async () => {
    const { core } = createCoreHarness();

    await core.workspace.open();

    expect(await current(core.workspace.workspace())).not.toBeNull();
    expect(await current(core.ownersWorkspace())).toBeNull();
  });

  it("a sign-out closes the workspace, drops the builder's proposal, and opens nothing", async () => {
    const { core, deps } = createCoreHarness({
      replies: [createBookReply()],
    });

    await core.session.signUp(READER, PASSWORD);
    await opened(core);
    core.builder.ask("a tracker for the books I'm reading");
    await builderIn(core, "proposed");

    const loadWorkspace = vi.spyOn(deps.library, "loadWorkspace");

    await core.session.signOut();
    await settle();

    expect(await current(core.ownersWorkspace())).toBeNull();
    expect(await current(core.workspace.workspace())).toBeNull();
    expect(await current(core.builder.state())).toEqual({
      kind: "idle",
      target: { kind: "new" },
    });
    expect(loadWorkspace).not.toHaveBeenCalled();
    await expect(core.workspace.addPanel(createSavedBookApp())).rejects.toThrow(
      "no workspace is open",
    );
  });

  it("gives the next owner only their own workspace", async () => {
    const { ports } = createStoresPerOwner();
    const { core } = createCoreHarness({ ports });

    await core.session.signUp("a@example.com", PASSWORD);
    await opened(core);
    await core.workspace.addPanel(
      await core.library.saveApp(AppDraft.parse(createBookApp())),
    );

    expect(await current(core.ownersWorkspace())).toMatchObject({
      panels: { books: { app: "books", appVersion: 1 } },
    });

    await core.session.signOut();
    await core.session.signUp("b@example.com", PASSWORD);

    expect(await opened(core)).toMatchObject({ version: 1, panels: {} });
  });

  it("never gives the owner before's workspace as the next one's, when another signs in with no sign-out between", async () => {
    const { ports } = createStoresPerOwner();
    const { core } = createCoreHarness({ ports });
    const given = collect(core.ownersWorkspace());

    await core.session.signUp("a@example.com", PASSWORD);
    await opened(core);
    await core.workspace.addPanel(
      await core.library.saveApp(AppDraft.parse(createBookApp())),
    );

    const since = given.emissions.length;

    await core.session.signUp("b@example.com", PASSWORD);

    expect(await opened(core)).toMatchObject({ version: 1, panels: {} });
    expect(
      given.emissions.slice(since).filter((workspace) => {
        return workspace !== null && Object.hasOwn(workspace.panels, "books");
      }),
    ).toEqual([]);
    given.stop();
  });

  it("does not save a change the owner before had queued at the sign-out", async () => {
    const { ports } = createStoresPerOwner();
    const { core } = createCoreHarness({ ports });

    await core.session.signUp("a@example.com", PASSWORD);
    await opened(core);

    const app = await core.library.saveApp(AppDraft.parse(createBookApp()));
    const adding = core.workspace.addPanel(app);

    await core.session.signOut();

    await expect(adding).rejects.toThrow(
      "the workspace was closed before this change was saved",
    );

    await core.session.signIn("a@example.com", PASSWORD);

    expect(await opened(core)).toMatchObject({ version: 1, panels: {} });
  });

  it("an accept under way when the owner changes writes nothing into the next owner's stores", async () => {
    const { ports, gate } = createStoresPerOwner();
    const { core, deps } = createCoreHarness({
      ports,
      replies: [createBookReply()],
    });

    await core.session.signUp("a@example.com", PASSWORD);
    await opened(core);
    core.builder.ask("a tracker for the books I'm reading");
    await builderIn(core, "proposed");
    gate.armed = true;

    const accepting = core.builder.accept();

    await core.session.signOut();
    await core.session.signUp("b@example.com", PASSWORD);
    await opened(core);
    gate.open();
    await accepting;

    expect(await current(core.builder.state())).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("The accept was stopped"),
    });
    expect((await current(deps.ontology.current())).version).toBe(0);
    expect(await current(core.library.apps())).toEqual([]);
    expect(await core.library.loadWorkspace("main")).toMatchObject({
      version: 1,
      panels: {},
    });
  });

  it("the same user said again hands nothing over", async () => {
    const { core, deps } = createCoreHarness({
      accounts: [{ email: READER, password: PASSWORD }],
    });

    await core.session.signIn(READER, PASSWORD);
    await opened(core);

    const app = await core.library.saveApp(AppDraft.parse(createBookApp()));

    await core.workspace.addPanel(app);
    core.builder.target({ kind: "revise", panel: "books", app });

    const loadWorkspace = vi.spyOn(deps.library, "loadWorkspace");

    await core.session.signIn(READER, PASSWORD);
    await settle();

    expect(await current(core.ownersWorkspace())).toMatchObject({
      panels: { books: { app: "books" } },
    });
    expect(await current(core.builder.state())).toMatchObject({
      target: { kind: "revise", panel: "books" },
    });
    expect(loadWorkspace).not.toHaveBeenCalled();
  });

  it("says why the owner's workspace could not be opened", async () => {
    const { core, deps } = createCoreHarness();

    vi.spyOn(deps.library, "loadWorkspace").mockRejectedValue(
      new Error("the library cannot be reached"),
    );
    await core.session.signUp(READER, PASSWORD);
    await settle();

    expect(await current(core.workspaceProblem())).toBe(
      "Your workspace could not be opened: the library cannot be reached",
    );
  });

  it("says what an open failed with when it is not an Error", async () => {
    const { core, deps } = createCoreHarness();

    vi.spyOn(deps.library, "loadWorkspace").mockImplementation(() => {
      // A store's client can reject with what is not an Error.
      return Promise.reject("the library cannot be reached");
    });
    await core.session.signUp(READER, PASSWORD);
    await settle();

    expect(await current(core.workspaceProblem())).toBe(
      "Your workspace could not be opened: the library cannot be reached",
    );
  });

  it("forgets why the workspace could not be opened at the next hand-over", async () => {
    const { core, deps } = createCoreHarness();

    vi.spyOn(deps.library, "loadWorkspace").mockRejectedValue(
      new Error("the library cannot be reached"),
    );
    await core.session.signUp(READER, PASSWORD);
    await settle();
    await core.session.signOut();

    expect(await current(core.workspaceProblem())).toBeNull();
  });

  it("does not say why the owner before's workspace could not be opened, even when the same user signs in again", async () => {
    const { core, deps } = createCoreHarness();
    const hold = createHold();
    const loadWorkspace = deps.library.loadWorkspace.bind(deps.library);

    vi.spyOn(deps.library, "loadWorkspace")
      .mockImplementationOnce(async () => {
        await hold.promise;

        throw new Error("the library cannot be reached");
      })
      .mockImplementation(loadWorkspace);
    await core.session.signUp(READER, PASSWORD);
    await core.session.signOut();
    await core.session.signIn(READER, PASSWORD);
    hold.release();
    await settle();

    expect(await current(core.workspaceProblem())).toBeNull();
    expect(await opened(core)).toMatchObject({ version: 1 });
  });

  it("gives the signed-in owner's apps as they are saved", async () => {
    const { core } = createCoreHarness();
    const apps = collect(core.ownersApps());

    await core.session.signUp(READER, PASSWORD);

    expect(apps.emissions.at(-1)).toEqual([]);

    await core.library.saveApp(AppDraft.parse(createBookApp()));

    expect(apps.emissions.at(-1)).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);
    apps.stop();
  });

  it("gives the next owner no app until their library answers, not the owner before's", async () => {
    const { core, deps } = createCoreHarness();
    const apps = collect(core.ownersApps());

    await core.session.signUp("a@example.com", PASSWORD);
    await core.library.saveApp(AppDraft.parse(createBookApp()));

    expect(apps.emissions.at(-1)).toHaveLength(1);

    // The next owner's library has not answered yet.
    vi.spyOn(deps.library, "apps").mockReturnValue(NEVER);
    await core.session.signUp("b@example.com", PASSWORD);

    expect(apps.emissions.at(-1)).toEqual([]);
    apps.stop();
  });

  it("asks the library for no app while nobody is signed in, and reads it again at each sign-in", async () => {
    const { core, deps } = createCoreHarness();
    const reads = vi.spyOn(deps.library, "apps");
    const apps = collect(core.ownersApps());

    await core.library.saveApp(AppDraft.parse(createBookApp()));

    expect(apps.emissions.at(-1)).toEqual([]);
    expect(reads).not.toHaveBeenCalled();

    await core.session.signUp(READER, PASSWORD);

    expect(apps.emissions.at(-1)).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);

    await core.session.signOut();

    expect(apps.emissions.at(-1)).toEqual([]);

    await core.session.signIn(READER, PASSWORD);

    expect(reads).toHaveBeenCalledTimes(2);
    apps.stop();
  });

  it("forgets the owner when the session's stream fails, and every reader hears the failure, one that comes after it too", async () => {
    const failing = new Subject<User | null>();
    const simulator = createSessionSimulator();
    let reads = 0;
    const { core } = createCoreHarness({
      ports: {
        session: {
          ...simulator,
          // Cold, as Supabase's is: each subscription is a listener of its
          // own. The first is the one that fails; a reader that subscribed
          // again would follow a session the core no longer does.
          user: (): Observable<User | null> => {
            return defer(() => {
              reads += 1;

              return reads === 1 ? failing : simulator.user();
            });
          },
        },
      },
    });
    const before = collect(core.session.user());
    const apps = collect(core.ownersApps());

    failing.next({ id: "user-1", email: READER });
    await opened(core);
    await core.library.saveApp(AppDraft.parse(createBookApp()));
    expect(apps.emissions.at(-1)).toHaveLength(1);

    failing.error(new Error("the session expired"));

    await expect(before.next()).resolves.toBeUndefined();
    await expect(before.next()).rejects.toThrow("the session expired");
    expect(failureHeardBy(core.session.user())).toEqual(
      new Error("the session expired"),
    );
    expect(await current(core.ownersWorkspace())).toBeNull();
    expect(await current(core.workspace.workspace())).toBeNull();
    expect(apps.emissions.at(-1)).toEqual([]);
    apps.stop();
  });

  it("follows who is signed in through one subscription to the session, however many read it", async () => {
    const session = createSessionSimulator();
    const user = vi.spyOn(session, "user");
    const { core } = createCoreHarness({ ports: { session } });
    const first = collect(core.session.user());
    const second = collect(core.session.user());

    await core.session.signUp(READER, PASSWORD);

    expect(user).toHaveBeenCalledOnce();
    expect(second.emissions).toEqual([null, { id: "user-1", email: READER }]);
    first.stop();
    second.stop();
  });
});

const READER = "reader@example.com";
const PASSWORD = "a long enough password";

/** The model's reply to "a tracker for the books I'm reading". */
function createBookReply(): GenerationEvent[] {
  return [
    {
      kind: "proposal",
      proposal: Proposal.parse({
        explanation: "A tracker for your books.",
        changeSet: createBookChange(),
        app: createBookApp(),
      }),
    },
  ];
}

function createSavedBookApp(): App {
  return App.parse({ ...createBookApp(), version: 1 });
}

/** The latest value of a stream that has one at once. */
function current<T>(stream: Observable<T>): Promise<T> {
  return firstValueFrom(stream);
}

/** What a reader subscribing now hears the stream failed with, at once; `undefined` when it hears no failure. */
function failureHeardBy(stream: Observable<unknown>): unknown {
  let heard: unknown;

  stream
    .subscribe({
      error: (error: unknown): void => {
        heard = error;
      },
    })
    .unsubscribe();

  return heard;
}

/** The owner's workspace, once it is open. */
function opened(core: Core): Promise<Workspace> {
  return firstValueFrom(
    core.ownersWorkspace().pipe(
      filter((workspace): workspace is Workspace => {
        return workspace !== null;
      }),
    ),
  );
}

function builderIn(
  core: Core,
  kind: BuilderState["kind"],
): Promise<BuilderState> {
  return firstValueFrom(
    core.builder.state().pipe(
      filter((state) => {
        return state.kind === kind;
      }),
    ),
  );
}

/** Lets what the core put off until the current work is done run: a store's answer, and what it starts. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < SETTLING_TURNS; turn += 1) {
    await Promise.resolve();
  }
}

const SETTLING_TURNS = 10;

/** A promise a test settles when it chooses. */
interface Hold {
  promise: Promise<void>;
  release: () => void;
}

function createHold(): Hold {
  const settles: (() => void)[] = [];
  const promise = new Promise<void>((resolve) => {
    settles.push(resolve);
  });

  return {
    promise,
    release: (): void => {
      for (const settle of settles) {
        settle();
      }
    },
  };
}

/** The book tracker's ontology with `author` deprecated, and actions that no longer set it. */
function createOntologyWithAuthorDeprecated(): Ontology {
  const ontology = createBookOntology();

  return Ontology.parse({
    ...ontology,
    objectTypes: ontology.objectTypes.map((type) => {
      return {
        ...type,
        properties: type.properties.map((property) => {
          return property.name === "author"
            ? { ...property, deprecated: true }
            : property;
        }),
      };
    }),
    actionTypes: (ontology.actionTypes ?? []).map((action) => {
      return { ...action, fields: ["title", "status", "rating"] };
    }),
  });
}
