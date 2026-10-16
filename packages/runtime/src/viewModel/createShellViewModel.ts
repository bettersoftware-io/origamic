import { useEffect, useState, useSyncExternalStore } from "react";
import type { Observable } from "rxjs";

import type {
  AppSession,
  BuilderState,
  Core,
  LibraryEntry,
  User,
} from "@origamic/core";
import type { App, Workspace } from "@origamic/spec";

/**
 * Everything the shell can read, as hooks: who is signed in, the builder,
 * the workspace and the library, and a session on each app it shows. The
 * shell reaches the core through this and nothing else; RxJS meets React
 * here (the role `bindings`).
 */
export interface ShellViewModel {
  useUser(): User | null;
  useBuilder(): BuilderState;
  useWorkspace(): Workspace | null;
  useLibrary(): readonly LibraryEntry[];
  /** A session on `app`, opened on mount and closed on unmount. Given another app, or another version, it opens a session on that one and closes the one before; an equal `App` of the same id and version keeps the session. */
  useAppSession(app: App): AppSession;
}

/**
 * Built once, by the composition root. It follows the core's streams from
 * now on and keeps the latest of each, so a component sees the current value
 * on its first render. Each of those streams emits its value at once, as
 * their ports say; one that does not is refused here, rather than guessed.
 */
export function createShellViewModel(core: Core): ShellViewModel {
  const user = follow(core.session.user(), "who is signed in");
  const builder = follow(core.builder.state(), "the builder's state");
  const workspace = follow(core.workspace.workspace(), "the workspace");
  const library = follow(core.library.apps(), "the library's apps");

  return {
    useUser: (): User | null => {
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
 * A stream of the core, followed for as long as the view model lives, with
 * its latest value at hand. It is subscribed to once: a cold stream (an
 * adapter's query) is read once. The value it gives on subscribing is its
 * first; a failure it ends with is kept, and thrown where the value is read,
 * for an error boundary to catch.
 */
function follow<T>(stream: Observable<T>, what: string): Followed<T> {
  const held: Held<T> = { latest: null, failure: null };
  const listeners = new Set<() => void>();

  function tellListeners(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  stream.subscribe({
    next: (value: T): void => {
      held.latest = { value };
      tellListeners();
    },
    error: (error: unknown): void => {
      held.failure = error instanceof Error ? error : new Error(String(error));
      tellListeners();
    },
  });

  if (held.latest === null && held.failure === null) {
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
