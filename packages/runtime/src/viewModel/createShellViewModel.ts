import { useEffect, useRef } from "react";
import { BehaviorSubject, type Observable } from "rxjs";

import type {
  AppSession,
  BuilderState,
  Core,
  LibraryEntry,
  User,
} from "@origamic/core";
import type { App, Workspace } from "@origamic/spec";

import { useObservable } from "./useObservable.ts";

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
  /** A session on `app`, opened on mount and closed on unmount. Given another app, it opens a session on that one and closes the one before. */
  useAppSession(app: App): AppSession;
}

/**
 * Built once, by the composition root. It follows the core's streams from
 * now on and keeps the latest of each, so a component sees the current value
 * on its first render, not a placeholder until the stream emits.
 */
export function createShellViewModel(core: Core): ShellViewModel {
  const user = follow(core.session.user(), null);
  // The builder emits its state at once; it starts idle on a new app.
  const builder = follow<BuilderState>(core.builder.state(), {
    kind: "idle",
    target: { kind: "new" },
  });
  const workspace = follow(core.workspace.workspace(), null);
  const library = follow<readonly LibraryEntry[]>(core.library.apps(), []);

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

/** A stream of the core, followed for as long as the view model lives, with its latest value at hand. */
function follow<T>(stream: Observable<T>, initial: T): BehaviorSubject<T> {
  const followed = new BehaviorSubject(initial);

  stream.subscribe(followed);

  return followed;
}

function useFollowed<T>(followed: BehaviorSubject<T>): T {
  return useObservable(changesOf, [followed], followed.getValue());
}

function changesOf<T>(followed: BehaviorSubject<T>): Observable<T> {
  return followed.asObservable();
}

/** A session on one app, and whether a mounted component holds it. */
interface Opened {
  app: App;
  session: AppSession;
  held: boolean;
}

/**
 * The session is closed a microtask after the component lets go of it, and
 * only if nothing took it up again: StrictMode unmounts and mounts a
 * component again at once, which must not leave it holding a closed
 * session.
 */
function useOpenedApp(core: Core, app: App): AppSession {
  const opened = useRef<Opened | null>(null);

  if (opened.current === null || opened.current.app !== app) {
    opened.current = { app, session: core.openApp(app), held: false };
  }

  const current = opened.current;

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
