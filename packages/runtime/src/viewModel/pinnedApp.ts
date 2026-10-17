import { catchError, defer, map, type Observable, of } from "rxjs";

import type { Core, LoadedApp } from "@origamic/core";

/**
 * The app a panel pins, as the panel shows it: still loading, loaded with
 * its compatibility against the current ontology (ADR-0005), missing from the
 * library, or not read at all, with why.
 */
export type PinnedApp =
  | { kind: "loading" }
  | LoadedPin
  | { kind: "missing" }
  | { kind: "failed"; message: string };

/** The app and its compatibility, as `core.loadApp` gives them. */
interface LoadedPin extends LoadedApp {
  kind: "loaded";
}

export const LOADING_PIN: PinnedApp = { kind: "loading" };

/** Reads the app at a pinned version, once, as a stream for `useObservable`: one value, then done. */
export function createPinnedAppLoader(
  core: Core,
): (id: string, version: number) => Observable<PinnedApp> {
  return (id: string, version: number): Observable<PinnedApp> => {
    return defer(() => {
      return core.loadApp(id, version);
    }).pipe(
      map((loaded): PinnedApp => {
        return loaded === null
          ? { kind: "missing" }
          : { kind: "loaded", ...loaded };
      }),
      catchError((error: unknown) => {
        return of<PinnedApp>({
          kind: "failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }),
    );
  };
}
