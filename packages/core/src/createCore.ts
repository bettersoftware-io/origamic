import {
  BehaviorSubject,
  firstValueFrom,
  type Observable,
  of,
  ReplaySubject,
  share,
  startWith,
  switchMap,
} from "rxjs";

import type { App, Catalog, Workspace } from "@origamic/spec";

import { type AppSession, openAppSession } from "./apps/appSession.ts";
import {
  type Compatibility,
  checkCompatibility,
} from "./apps/compatibility.ts";
import { type Builder, createBuilder } from "./builder/builder.ts";
import type { LlmGatewayPort } from "./ports/llmGatewayPort.ts";
import type { ObjectStorePort } from "./ports/objectStorePort.ts";
import type { OntologyStorePort } from "./ports/ontologyStorePort.ts";
import type { SessionPort, SignInResult, User } from "./ports/sessionPort.ts";
import type { LibraryEntry, SpecLibraryPort } from "./ports/specLibraryPort.ts";
import {
  createWorkspacePresenter,
  type WorkspacePresenter,
} from "./workspace/workspacePresenter.ts";

/** Everything the core is handed: one adapter or simulator for each port, and the catalog it checks apps against. */
export interface CoreDeps {
  ontology: OntologyStorePort;
  objects: ObjectStorePort;
  library: SpecLibraryPort;
  llm: LlmGatewayPort;
  session: SessionPort;
  catalog: Catalog;
}

/** An app as loaded from the library, with whether it still works on the current ontology (ADR-0005). */
export interface LoadedApp {
  app: App;
  compatibility: Compatibility;
}

/** The application, without a screen. */
export interface Core {
  /**
   * Who is signed in, and signing in and out. The core follows who is
   * signed in: when that changes (a sign-out, another sign-in) it forgets
   * the owner before (their workspace is closed, and the builder drops what
   * it was asked or proposed, an accept under way included), and opens the
   * workspace of whoever signed in. The stores answer whoever their session
   * holds, so nothing decided for one owner may reach them after that.
   * `user()` is the session's, read once by the core and shared by every
   * reader, the core first. When it fails, every reader hears the failure,
   * and the core forgets the owner as at a sign-out.
   */
  readonly session: SessionPort;
  /** The conversation with the model, and accepting what it proposes. */
  readonly builder: Builder;
  /** The workspace the core has open: its panels and their pins, and the changes to them. */
  readonly workspace: WorkspacePresenter;
  /** The library: apps and workspaces, every version of each, of whoever the store's session holds. */
  readonly library: SpecLibraryPort;
  /** The signed-in owner's workspace: `null` while nobody is signed in, and until theirs is open. */
  ownersWorkspace(): Observable<Workspace | null>;
  /** The signed-in owner's apps, each at its latest version: none while nobody is signed in, and none from a sign-in until their library has answered; read afresh at each sign-in. */
  ownersApps(): Observable<readonly LibraryEntry[]>;
  /** Why the signed-in owner's workspace could not be opened, or `null`. Forgotten at each change of owner. */
  workspaceProblem(): Observable<string | null>;
  /** Opens an app: its state, its views' rows, and its elements' events. Close it when it leaves the screen. */
  openApp(app: App): AppSession;
  /** The app at that version, with the compatibility check against the current ontology; `null` when the library has no such version. */
  loadApp(id: string, version: number): Promise<LoadedApp | null>;
}

/** Builds the core over its ports, and starts following who is signed in. Only `createCoreHarness` calls it in a test; the composition root calls it in the app, once. */
export function createCore(deps: CoreDeps): Core {
  const workspace = createWorkspacePresenter(deps.library);
  const builder = createBuilder({ ...deps, workspace });
  // One subscription to the port for every reader. A failure is kept and
  // given to every reader, those who come after it too: one that resubscribed
  // the port instead would follow a session the core no longer does.
  const users = deps.session.user().pipe(
    share({
      connector: (): ReplaySubject<User | null> => {
        return new ReplaySubject<User | null>(1);
      },
      resetOnError: false,
      resetOnComplete: false,
      resetOnRefCountZero: false,
    }),
  );
  /** Whose the workspace and the apps the core gives are: the signed-in user's id, or `null`. */
  const owner = new BehaviorSubject<string | null>(null);
  const problem = new BehaviorSubject<string | null>(null);
  /** Counts the changes of owner: a failure that comes after one is the owner before's. */
  let owners = 0;

  /**
   * Forgets the owner before, when whoever is signed in is someone else (a
   * sign-out, another sign-in, not the same user said again), then opens the
   * workspace of whoever is signed in now, when someone is.
   */
  function handOver(user: User | null): void {
    const id = user?.id ?? null;

    if (id === owner.getValue()) {
      return;
    }

    owners += 1;
    workspace.close();
    builder.close();
    problem.next(null);
    owner.next(id);

    if (id !== null) {
      openWorkspace(owners);
    }
  }

  function openWorkspace(openedFor: number): void {
    // Nothing waits: the workspace arrives through its stream, and a
    // failure through `workspaceProblem`, unless the owner changed since.
    void workspace.open().catch((error: unknown) => {
      if (openedFor === owners) {
        problem.next(
          `Your workspace could not be opened: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  users.subscribe({
    next: handOver,
    error: (): void => {
      // Who is signed in is no longer known, while the stores go on with
      // whatever session they hold: forget the owner, as at a sign-out.
      // Whoever reads `session.user()` hears the failure: the shell shows it.
      handOver(null);
    },
  });

  return {
    session: {
      user: (): Observable<User | null> => {
        return users;
      },
      signIn: (email: string, password: string): Promise<SignInResult> => {
        return deps.session.signIn(email, password);
      },
      signUp: (email: string, password: string): Promise<SignInResult> => {
        return deps.session.signUp(email, password);
      },
      signOut: (): Promise<void> => {
        return deps.session.signOut();
      },
    },
    builder,
    workspace,
    library: deps.library,
    ownersWorkspace: (): Observable<Workspace | null> => {
      return owner.pipe(
        switchMap((id) => {
          return id === null ? of(null) : workspace.workspace();
        }),
      );
    },
    ownersApps: (): Observable<readonly LibraryEntry[]> => {
      return owner.pipe(
        switchMap((id) => {
          // None until the next owner's library answers: the apps of the
          // owner before are never given as theirs.
          return id === null
            ? of(NO_APPS)
            : deps.library.apps().pipe(startWith(NO_APPS));
        }),
      );
    },
    workspaceProblem: (): Observable<string | null> => {
      return problem.asObservable();
    },
    openApp: (app: App): AppSession => {
      return openAppSession(app, deps);
    },
    loadApp: async (id: string, version: number): Promise<LoadedApp | null> => {
      const app = await deps.library.loadApp(id, version);

      if (app === null) {
        return null;
      }

      const ontology = await firstValueFrom(deps.ontology.current());

      return { app, compatibility: checkCompatibility(app, ontology) };
    },
  };
}

const NO_APPS: readonly LibraryEntry[] = [];
