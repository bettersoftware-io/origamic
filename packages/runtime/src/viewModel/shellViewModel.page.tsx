import { act, render } from "@testing-library/react";
import { type ReactElement, StrictMode } from "react";
import {
  defer,
  filter,
  firstValueFrom,
  from,
  merge,
  type Observable,
  Subject,
  switchMap,
} from "rxjs";

import {
  type AppSession,
  type BuilderState,
  type Core,
  type CoreDeps,
  createOntologyStoreSimulator,
  createSessionSimulator,
  createSpecLibrarySimulator,
  type LibraryEntry,
  type OntologyStorePort,
  type SessionPort,
  type SpecLibraryPort,
  type User,
} from "@origamic/core";
import { createCoreHarness } from "@origamic/core/testing/coreHarness.ts";
import {
  App,
  AppDraft,
  type Applied,
  type ChangeSet,
  type GenerationEvent,
  Ontology,
  type Workspace,
  type WorkspaceDraft,
} from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
} from "@origamic/spec/testing/bookTracker.ts";

import {
  createShellViewModel,
  type ShellViewModel,
} from "./createShellViewModel.ts";
import type { PinnedApp } from "./pinnedApp.ts";
import { ShellViewModelProvider } from "./ShellViewModelProvider.tsx";
import { useShellViewModel } from "./useShellViewModel.ts";

/** What a test varies of the shell: whether it shows the book tracker, and whether under StrictMode. */
export interface ShellPageOptions {
  showsApp?: boolean;
  strict?: boolean;
  /** The pin a panel holds, whose app the shell reads with `usePinnedApp`. */
  pin?: Pin;
  /** Why opening the workspace fails, when it does. */
  openFails?: string;
  /** Why loading an app fails, when it does. */
  loadFails?: string;
  /** What loading an app rejects with when it fails with something that is not an Error. */
  loadRejectsWith?: string;
  /** Each owner's workspace is their own, as Supabase's row-level security keeps it; the simulators' library has one for everyone. */
  workspacePerOwner?: boolean;
  /** The model's replies, one generation each. */
  replies?: readonly (readonly GenerationEvent[])[];
  /** The session answers who is signed in only when the test says, as Supabase's does once it has read the browser's storage. */
  lateSession?: boolean;
}

/** An app and the version of it a panel pins. */
interface Pin {
  id: string;
  version: number;
}

/** What a test can do with, and ask of, a shell that reads everything its view model offers. */
export interface ShellPage {
  user: () => User | null | undefined;
  /** The session says who is signed in, when it answers late. */
  answerSession: (user: User | null) => Promise<void>;
  /** The builder's state as the shell saw it on its first render. */
  firstBuilderState: () => BuilderState | undefined;
  workspace: () => Workspace | null;
  /** Why the workspace could not be opened, as the shell was told last. */
  workspaceProblem: () => string | null;
  library: () => readonly LibraryEntry[];
  /** The pinned app as the shell saw it last. */
  pinned: () => PinnedApp | null;
  /** Pins the panel to another app or version. */
  pinTo: (pin: Pin) => Promise<void>;
  /** The session the shown app's view holds now. */
  appSession: () => AppSession;
  signUp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Signs in an account `signUp` made. */
  signIn: (email: string) => Promise<void>;
  /** How many times the view model asked the library for its apps. */
  libraryReads: () => number;
  openWorkspace: () => Promise<void>;
  saveBookApp: () => Promise<void>;
  /** Stops showing the app, as closing its panel does. */
  hideApp: () => Promise<void>;
  /** Shows the book tracker's next version in the same place, as moving a panel's pin does. */
  showNextVersion: () => Promise<void>;
  /** Shows an equal copy of the app shown (the same id and version), built afresh, as a shell does that reads its apps again. */
  showEqualCopy: () => Promise<void>;
  /** How many times the view model subscribed to who is signed in. */
  userSubscriptions: () => number;
  /** Ends the stream of who is signed in with a failure. Rejects with what the shell threw. */
  failUser: (message: string) => Promise<void>;
  /** Lets what React and the view model put off until the current work is done run. */
  settle: () => Promise<void>;
  /** Opens the book tracker at version 1 in a panel of the workspace the core holds. Resolves when it is saved, or rejects with why not. */
  addBookPanel: () => Promise<void>;
  /**
   * Accepts the proposal shown while the owner signs out and `next` signs
   * up: the accept is held at its first read of the ontology until the new
   * owner's workspace is open. Resolves with what the new owner then has.
   */
  acceptWhileOwnerChanges: (next: string) => Promise<OwnersStores>;
  /** Starts adding the book tracker's panel, signs out before that change has its turn, and settles with how the change went. */
  addBookPanelWhileSigningOut: () => Promise<PromiseSettledResult<void>>;
  /** The builder's state as the shell saw it last. */
  builderState: () => BuilderState | undefined;
  /** Asks the builder for an app, and waits for its proposal. */
  askForBookTracker: () => Promise<void>;
}

/** Mounts a shell under the provider, on the core's simulators with the book tracker's ontology. */
export function mountShell({
  showsApp = false,
  strict = false,
  pin,
  openFails,
  loadFails,
  loadRejectsWith,
  workspacePerOwner = false,
  replies = [],
  lateSession = false,
}: ShellPageOptions = {}): ShellPage {
  const session = createSessionSimulator();
  const gate = createGate();
  const { core, deps } = createCoreHarness({
    ontology: Ontology.parse(createBookOntology()),
    replies,
    ports: workspacePerOwner ? createStoresPerOwner(session, gate) : {},
  });
  const { workspace } = core;
  const userFailures = new Subject<never>();
  const lateUsers = new Subject<User | null>();
  let userSubscriptions = 0;

  /** Who is signed in, as the core says, counting each subscription, and failing when the test says so. */
  function users(): Observable<User | null> {
    return defer(() => {
      userSubscriptions += 1;

      return merge(lateSession ? lateUsers : core.session.user(), userFailures);
    });
  }

  let libraryReads = 0;

  /** The library's apps, as the core gives them, counting each time they are asked for. */
  function apps(): Observable<readonly LibraryEntry[]> {
    return defer(() => {
      libraryReads += 1;

      return core.library.apps();
    });
  }

  const viewModel = createShellViewModel({
    ...core,
    session: { ...core.session, user: users },
    library: { ...core.library, apps },
    workspace:
      openFails === undefined
        ? workspace
        : { ...workspace, open: failWith(openFails) },
    loadApp: loadOf(core, loadFails, loadRejectsWith),
  });
  const seen = createSeen();
  const first = App.parse({ ...createBookApp(), version: 1 });
  const next = App.parse({ ...createBookApp(), version: 2 });

  /** The shell showing `app`. StrictMode goes at the root: React runs a component's effects twice on mount only under a root in StrictMode. */
  let pinned = pin ?? null;

  function shellShowing(app: App | null): ReactElement {
    const shell = (
      <Shell viewModel={viewModel} app={app} pin={pinned} seen={seen} />
    );

    return strict ? <StrictMode>{shell}</StrictMode> : shell;
  }

  const rendered = render(shellShowing(showsApp ? first : null));

  async function settle(): Promise<void> {
    await act(async () => {
      await Promise.resolve();
    });
  }

  let shown: App | null = showsApp ? first : null;

  async function show(app: App | null): Promise<void> {
    shown = app;
    await act(async () => {
      rendered.rerender(shellShowing(app));
    });
    await settle();
  }

  return {
    user: (): User | null | undefined => {
      return seen.user;
    },
    answerSession: async (user: User | null): Promise<void> => {
      await act(async () => {
        lateUsers.next(user);
      });
    },
    firstBuilderState: (): BuilderState | undefined => {
      return seen.builderStates[0];
    },
    workspace: (): Workspace | null => {
      return seen.workspace;
    },
    workspaceProblem: (): string | null => {
      return seen.workspaceProblem;
    },
    library: (): readonly LibraryEntry[] => {
      return seen.library;
    },
    pinned: (): PinnedApp | null => {
      return seen.pinned;
    },
    pinTo: async (next: Pin): Promise<void> => {
      pinned = next;
      await show(shown);
    },
    appSession: (): AppSession => {
      if (seen.session === null) {
        throw new Error("the shell shows no app");
      }

      return seen.session;
    },
    signUp: async (email: string): Promise<void> => {
      await act(async () => {
        await core.session.signUp(email, PASSWORD);
      });
    },
    signOut: async (): Promise<void> => {
      await act(async () => {
        await core.session.signOut();
      });
    },
    signIn: async (email: string): Promise<void> => {
      await act(async () => {
        await core.session.signIn(email, PASSWORD);
      });
    },
    libraryReads: (): number => {
      return libraryReads;
    },
    addBookPanel: async (): Promise<void> => {
      await act(async () => {
        await workspace.addPanel(first);
      });
    },
    acceptWhileOwnerChanges: async (next: string): Promise<OwnersStores> => {
      gate.armed = true;

      let accepting: Promise<void> = Promise.resolve();

      await act(async () => {
        accepting = core.builder.accept();
        await core.session.signOut();
        await core.session.signUp(next, PASSWORD);
      });
      await settle();
      await act(async () => {
        gate.open();
        await accepting;
      });
      await settle();

      return {
        ontologyVersion: (await firstValueFrom(deps.ontology.current()))
          .version,
        apps: await firstValueFrom(core.library.apps()),
        workspace: await core.library.loadWorkspace("main"),
      };
    },
    addBookPanelWhileSigningOut: async (): Promise<
      PromiseSettledResult<void>
    > => {
      const app = await core.library.loadApp("books");

      if (app === null) {
        throw new Error("the book tracker is not saved");
      }

      let adding: Promise<void> = Promise.resolve();

      await act(async () => {
        adding = workspace.addPanel(app);
        await core.session.signOut();
      });

      const [outcome] = await Promise.allSettled([adding]);

      return outcome;
    },
    builderState: (): BuilderState | undefined => {
      return seen.builderStates.at(-1);
    },
    askForBookTracker: async (): Promise<void> => {
      await act(async () => {
        core.builder.ask("a tracker for the books I'm reading");
        await firstValueFrom(
          core.builder.state().pipe(
            filter((state) => {
              return state.kind === "proposed";
            }),
          ),
        );
      });
    },
    openWorkspace: async (): Promise<void> => {
      await act(async () => {
        await core.workspace.open();
      });
    },
    saveBookApp: async (): Promise<void> => {
      await act(async () => {
        await core.library.saveApp(AppDraft.parse(createBookApp()));
      });
    },
    hideApp: async (): Promise<void> => {
      await show(null);
    },
    showNextVersion: async (): Promise<void> => {
      await show(next);
    },
    showEqualCopy: async (): Promise<void> => {
      if (shown === null) {
        throw new Error("the shell shows no app to copy");
      }

      await show(App.parse({ ...createBookApp(), version: shown.version }));
    },
    userSubscriptions: (): number => {
      return userSubscriptions;
    },
    failUser: async (message: string): Promise<void> => {
      await act(async () => {
        userFailures.error(new Error(message));
      });
    },
    settle,
  };
}

const PASSWORD = "a long enough password";

/** What an owner has in the stores: their ontology's version, their apps, and their workspace as saved. */
interface OwnersStores {
  ontologyVersion: number;
  apps: readonly LibraryEntry[];
  workspace: Workspace | null;
}

/** Holds the ontology's reads, once armed, until the test opens it. */
interface Gate {
  armed: boolean;
  opened: Promise<void>;
  open: () => void;
}

function createGate(): Gate {
  const opening = new Subject<undefined>();
  const opened = firstValueFrom(opening).then(() => {
    return undefined;
  });

  return {
    armed: false,
    opened,
    open: (): void => {
      opening.next(undefined);
    },
  };
}

/**
 * The session, and an ontology and a library with a shelf of their own for
 * each signed-in user, as Supabase keeps each owner's rows apart: the
 * simulators have one shelf for everyone. Like Supabase's, they answer
 * whoever is signed in when they are called, not whoever was when the
 * caller began. Nobody signed in has a shelf too, which no owner sees. Once
 * the gate is armed, a read of the ontology waits for it.
 */
function createStoresPerOwner(
  session: SessionPort,
  gate: Gate,
): Partial<Omit<CoreDeps, "catalog">> {
  const libraries = new Map<string, SpecLibraryPort>();
  const ontologies = new Map<string, OntologyStorePort>();
  let owner = "";

  session.user().subscribe((user) => {
    owner = user?.id ?? "";
  });

  function library(): SpecLibraryPort {
    const found = libraries.get(owner) ?? createSpecLibrarySimulator();

    libraries.set(owner, found);

    return found;
  }

  function ontology(): OntologyStorePort {
    const found = ontologies.get(owner) ?? createOntologyStoreSimulator();

    ontologies.set(owner, found);

    return found;
  }

  return {
    session,
    ontology: {
      current: (): Observable<Ontology> => {
        return defer(() => {
          return gate.armed
            ? from(gate.opened).pipe(
                switchMap(() => {
                  return ontology().current();
                }),
              )
            : ontology().current();
        });
      },
      apply: (change: ChangeSet): Promise<Applied> => {
        return ontology().apply(change);
      },
    },
    library: {
      apps: (): Observable<readonly LibraryEntry[]> => {
        return library().apps();
      },
      workspaces: (): Observable<readonly LibraryEntry[]> => {
        return library().workspaces();
      },
      loadApp: (id: string, version?: number): Promise<App | null> => {
        return library().loadApp(id, version);
      },
      saveApp: (draft: AppDraft): Promise<App> => {
        return library().saveApp(draft);
      },
      loadWorkspace: (
        id: string,
        version?: number,
      ): Promise<Workspace | null> => {
        return library().loadWorkspace(id, version);
      },
      saveWorkspace: (draft: WorkspaceDraft): Promise<Workspace> => {
        return library().saveWorkspace(draft);
      },
    },
  };
}

/** Mounts a component that reads the view model, with no provider above it. React reports what it threw. */
export function mountWithoutProvider(): void {
  render(<Reader seen={createSeen()} />);
}

interface Seen {
  user: User | null | undefined;
  builderStates: BuilderState[];
  workspace: Workspace | null;
  workspaceProblem: string | null;
  library: readonly LibraryEntry[];
  pinned: PinnedApp | null;
  session: AppSession | null;
}

interface ShellProps {
  viewModel: ShellViewModel;
  app: App | null;
  pin: Pin | null;
  seen: Seen;
}

function Shell({ viewModel, app, pin, seen }: ShellProps): ReactElement {
  return (
    <ShellViewModelProvider viewModel={viewModel}>
      <Reader seen={seen} />
      {app === null ? null : <AppHolder app={app} seen={seen} />}
      {pin === null ? null : <PinReader pin={pin} seen={seen} />}
    </ShellViewModelProvider>
  );
}

interface ReaderProps {
  seen: Seen;
}

/** Reads every stream the view model offers, and notes what it saw. */
function Reader({ seen }: ReaderProps): ReactElement {
  const { useUser, useBuilder, useWorkspace, useWorkspaceProblem, useLibrary } =
    useShellViewModel();

  seen.user = useUser();
  seen.builderStates.push(useBuilder());
  seen.workspace = useWorkspace();
  seen.workspaceProblem = useWorkspaceProblem();
  seen.library = useLibrary();

  return <output />;
}

interface AppHolderProps {
  app: App;
  seen: Seen;
}

/** Holds a session on the app, as an app's panel does. */
function AppHolder({ app, seen }: AppHolderProps): ReactElement {
  const { useAppSession } = useShellViewModel();

  seen.session = useAppSession(app);

  return <output />;
}

interface PinReaderProps {
  pin: Pin;
  seen: Seen;
}

/** Reads the app a panel pins, as a panel does. */
function PinReader({ pin, seen }: PinReaderProps): ReactElement {
  const { usePinnedApp } = useShellViewModel();

  seen.pinned = usePinnedApp(pin.id, pin.version);

  return <output />;
}

function createSeen(): Seen {
  return {
    user: null,
    builderStates: [],
    workspace: null,
    workspaceProblem: null,
    library: [],
    pinned: null,
    session: null,
  };
}

/** How the shell's core loads an app: as it does, or failing with an Error, or with something else. */
function loadOf(
  core: Core,
  fails: string | undefined,
  rejectsWith: string | undefined,
): Core["loadApp"] {
  if (fails !== undefined) {
    return failWith(fails);
  }

  return rejectsWith === undefined
    ? core.loadApp
    : (): Promise<never> => {
        // A store's client can reject with what is not an Error.
        return Promise.reject(rejectsWith);
      };
}

/** A port's method that fails, as one does when its store cannot be reached. */
function failWith(message: string): () => Promise<never> {
  return (): Promise<never> => {
    return Promise.reject(new Error(message));
  };
}
