import { useEffect, useState, useSyncExternalStore } from "react";
import {
  BehaviorSubject,
  distinctUntilChanged,
  type Observable,
  of,
  switchMap,
} from "rxjs";

import type {
  AppSession,
  BuilderState,
  Core,
  LibraryEntry,
  User,
} from "@origamic/core";
import type { App, Workspace } from "@origamic/spec";

import {
  createPinnedAppLoader,
  LOADING_PIN,
  type PinnedApp,
} from "./pinnedApp.ts";
import { createShellIntents, type ShellIntents } from "./shellIntents.ts";
import { useObservable } from "./useObservable.ts";

/**
 * Everything the shell can read or do, as hooks: who is signed in, the
 * builder, the workspace and the library, the app each panel pins and a
 * session on each app it shows, and the intents. The shell reaches the core
 * through this and nothing else; RxJS meets React here (the role
 * `bindings`).
 */
export interface ShellViewModel {
  /** Who is signed in, `null` for nobody, and `undefined` until the session has said: a session kept in the browser is read when the app starts. */
  useUser(): User | null | undefined;
  useBuilder(): BuilderState;
  useWorkspace(): Workspace | null;
  /** The signed-in user's apps, each at its latest version: none while nobody is signed in, and none until the library has answered. */
  useLibrary(): readonly LibraryEntry[];
  /** Why the signed-in user's workspace could not be opened, or `null`. It is opened at each sign-in. */
  useWorkspaceProblem(): string | null;
  /** The app at the version a panel pins, loaded from the library with its compatibility check; loading until it is read, and read again for another id or version. */
  usePinnedApp(id: string, version: number): PinnedApp;
  /** What the shell can do. The same functions on every render. */
  useIntents(): ShellIntents;
  /** A session on `app`, opened on mount and closed on unmount. Given another app, or another version, it opens a session on that one and closes the one before; an equal `App` of the same id and version keeps the session. */
  useAppSession(app: App): AppSession;
}

/**
 * Built once, by the composition root. It follows the core's streams from
 * now on and keeps the latest of each, so a component sees the current value
 * on its first render. The builder's state and the workspace emit theirs at
 * once, and a core whose stream does not is refused here, rather than
 * guessed. Who is signed in and the library's apps come from a store, which
 * answers when it has read them: until then the user is `undefined` and the
 * library has no app. The library is the signed-in user's, read again at
 * each sign-in, and has no app while nobody is signed in.
 */
export function createShellViewModel(core: Core): ShellViewModel {
  const workspaceProblem = new BehaviorSubject<string | null>(null);
  /** Whose library and workspace are shown: the signed-in user's id, or `null`. */
  const owner = new BehaviorSubject<string | null>(null);
  let signedIn: string | null = null;

  /**
   * Hands the shell to whoever is signed in now. When that changes (a
   * sign-out, another sign-in) the owner before is forgotten first: the
   * workspace is closed, so none of their panels shows and no change of
   * theirs is saved after, and the builder drops what it was asked or
   * proposed. Then the new owner's workspace is opened, when there is one.
   * The library follows the owner too.
   */
  function handOver(next: User | null | undefined): void {
    const id = next?.id ?? null;

    if (id === signedIn) {
      return;
    }

    signedIn = id;
    core.workspace.close();
    core.builder.target({ kind: "new" });
    workspaceProblem.next(null);
    owner.next(id);

    if (id !== null) {
      openWorkspaceFor(id);
    }
  }

  function openWorkspaceFor(id: string): void {
    // Nothing waits: the workspace arrives through its stream, and a
    // failure is shown through `useWorkspaceProblem`, unless the owner has
    // changed since.
    void core.workspace.open().catch((error: unknown) => {
      if (signedIn === id) {
        workspaceProblem.next(
          `Your workspace could not be opened: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  const user = follow<User | null | undefined>(
    core.session.user(),
    "who is signed in",
    { before: { value: undefined }, onValue: handOver },
  );
  const builder = follow(core.builder.state(), "the builder's state");
  // The workspace is the signed-in owner's, and none while nobody is: what
  // the core held for the owner before never reaches the next one's shell.
  const workspace = follow(
    owner.pipe(
      distinctUntilChanged(),
      switchMap((id) => {
        return id === null ? of(null) : core.workspace.workspace();
      }),
    ),
    "the workspace",
  );

  // The library is read for each owner afresh: a store answers only a
  // signed-in user, and only with their own apps.
  const library = follow(
    owner.pipe(
      distinctUntilChanged(),
      switchMap((id) => {
        return id === null ? of(NO_APPS) : core.library.apps();
      }),
    ),
    "the library's apps",
    { before: { value: NO_APPS } },
  );
  const problem = follow(workspaceProblem, "the workspace's problem");
  const loadPinned = createPinnedAppLoader(core);
  const intents = createShellIntents(core);

  return {
    useUser: (): User | null | undefined => {
      return useFollowed(user);
    },
    useBuilder: (): BuilderState => {
      return useFollowed(builder);
    },
    useWorkspace: (): Workspace | null => {
      return useFollowed(workspace);
    },
    useLibrary: (): readonly LibraryEntry[] => {
      return useFollowed(library);
    },
    useWorkspaceProblem: (): string | null => {
      return useFollowed(problem);
    },
    usePinnedApp: (id: string, version: number): PinnedApp => {
      return useObservable(loadPinned, [id, version], LOADING_PIN);
    },
    useIntents: (): ShellIntents => {
      return intents;
    },
    useAppSession: (app: App): AppSession => {
      return useOpenedApp(core, app);
    },
  };
}

/** A stream of the core as React's external stores are read: its latest value, and a way to hear that it changed. Both keep their identity. */
interface Followed<T> {
  subscribe: (onChange: () => void) => () => void;
  current: () => T;
}

/**
 * A stream of the core, with its latest value at hand. It is followed for
 * as long as the core's stream lives: nothing unsubscribes, and the
 * composition root makes one view model per core, so nothing is left
 * behind. It is subscribed to once: a cold stream (an adapter's query) is
 * read once. The value it gives on subscribing is its
 * first; a failure it ends with is kept, and thrown where the value is read,
 * for an error boundary to catch. A stream with nothing `before` must give
 * a value on subscribing. `onValue` hears each value before the listeners
 * do, so what one starts (a workspace opened at a sign-in) needs no second
 * subscription.
 */
function follow<T>(
  stream: Observable<T>,
  what: string,
  { before, onValue = ignore }: Following<T> = {},
): Followed<T> {
  const held: Held<T> = { latest: before ?? null, failure: null };
  const listeners = new Set<() => void>();

  function tellListeners(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  stream.subscribe({
    next: (value: T): void => {
      held.latest = { value };
      onValue(value);
      tellListeners();
    },
    error: (error: unknown): void => {
      held.failure = error instanceof Error ? error : new Error(String(error));
      tellListeners();
    },
  });

  if (before === undefined && held.latest === null && held.failure === null) {
    throw new Error(
      `the core gave no value at once for ${what}; the shell's view model reads each stream's current value, and a port's stream emits at once`,
    );
  }

  return {
    subscribe: (onChange: () => void): (() => void) => {
      listeners.add(onChange);

      return (): void => {
        listeners.delete(onChange);
      };
    },
    current: (): T => {
      if (held.failure !== null || held.latest === null) {
        throw held.failure ?? new Error(`the core gave no value for ${what}`);
      }

      return held.latest.value;
    },
  };
}

/** How a stream is followed: what stands for it until its first value, and what its values start besides the listeners. */
interface Following<T> {
  before?: Given<T>;
  onValue?: (value: T) => void;
}

const NO_APPS: readonly LibraryEntry[] = [];

/** What a followed stream's value starts besides its listeners, when nothing is asked for. */
function ignore(): void {
  // Nothing to start.
}

/** What a followed stream gave last: its latest value, or the failure it ended with. */
interface Held<T> {
  latest: Given<T> | null;
  failure: Error | null;
}

interface Given<T> {
  value: T;
}

function useFollowed<T>(followed: Followed<T>): T {
  return useSyncExternalStore(followed.subscribe, followed.current);
}

/** A session on one app, and whether a mounted component holds it. */
interface Opened {
  app: App;
  session: AppSession;
  held: boolean;
}

/**
 * The session is kept in state, so a render React discards (a concurrent
 * render of another app) changes nothing: only a committed render's session
 * is the component's. Given another app or version, the render opens a
 * session for it and stores it at once, the pattern React documents for
 * state derived from a prop.
 *
 * Opening a session in render is safe: it holds no subscription until one of
 * its streams is read, so a session a discarded render opened leaves nothing
 * open. A version never changes, so an equal `App` built afresh keeps the
 * session and the state it holds.
 *
 * The session is closed a microtask after the component lets go of it, and
 * only if nothing took it up again: StrictMode unmounts and mounts a
 * component again at once, which must not leave it holding a closed
 * session.
 */
function useOpenedApp(core: Core, app: App): AppSession {
  const [opened, setOpened] = useState<Opened>(() => {
    return openedFor(core, app);
  });
  let current = opened;

  if (opened.app.id !== app.id || opened.app.version !== app.version) {
    current = openedFor(core, app);
    setOpened(current);
  }

  useEffect(() => {
    current.held = true;

    return (): void => {
      current.held = false;
      queueMicrotask(() => {
        if (!current.held) {
          current.session.close();
        }
      });
    };
  }, [current]);

  return current.session;
}

function openedFor(core: Core, app: App): Opened {
  return { app, session: core.openApp(app), held: false };
}
