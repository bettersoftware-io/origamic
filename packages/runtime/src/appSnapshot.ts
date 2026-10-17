import { catchError, combineLatest, map, type Observable, of } from "rxjs";

import type { AppSession, StateValues } from "@origamic/core";
import type { App, Problem, Row } from "@origamic/spec";

/** Everything an open app's elements are drawn from, at one moment: its state, the rows of each view an element reads, and each element's problems. */
export interface AppSnapshot {
  state: StateValues;
  rows: Readonly<Record<string, readonly Row[]>>;
  problems: Readonly<Record<string, readonly Problem[]>>;
}

/** What an app view shows: nothing yet, the app, or why it cannot. */
export type Shown =
  | { kind: "loading" }
  | { kind: "shown"; snapshot: AppSnapshot }
  | { kind: "failed"; message: string };

export const LOADING: Shown = { kind: "loading" };

/**
 * The app as its session has it, again each time any part of it changes.
 * Each view an element reads is read once, however many elements read it.
 * A stream that fails (a view the app does not declare, a store that cannot
 * be reached) ends it with the failure, so a panel says why it is empty.
 */
export function showApp(app: App, session: AppSession): Observable<Shown> {
  return combineLatest({
    state: session.state(),
    rows: byId(viewsReadBy(app), (viewId) => {
      return session.rows(viewId);
    }),
    problems: byId(Object.keys(app.ui.elements), (elementId) => {
      return session.problems(elementId);
    }),
  }).pipe(
    map((snapshot): Shown => {
      return { kind: "shown", snapshot };
    }),
    catchError((error: unknown) => {
      return of<Shown>({ kind: "failed", message: messageOf(error) });
    }),
  );
}

/** What a failure says, for a person to read. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The latest value of each stream, by id. No id gives an empty record at once, where `combineLatest` would give nothing. */
function byId<T>(
  ids: readonly string[],
  open: (id: string) => Observable<T>,
): Observable<Readonly<Record<string, T>>> {
  if (ids.length === 0) {
    return of({});
  }

  return combineLatest(
    Object.fromEntries(
      ids.map((id) => {
        return [id, open(id)];
      }),
    ),
  );
}

/** The views the elements' props read, each once. */
function viewsReadBy(app: App): string[] {
  const read = new Set<string>();

  for (const element of Object.values(app.ui.elements)) {
    for (const value of Object.values(element.props)) {
      const viewId = viewIdOf(value);

      if (viewId !== undefined) {
        read.add(viewId);
      }
    }
  }

  return [...read];
}

type PropValue = App["ui"]["elements"][string]["props"][string];

/** The view a `{"$view": …}` names; `undefined` for anything else. */
export function viewIdOf(value: PropValue): string | undefined {
  return referenceOf(value, "$view");
}

/** The state key a `{"$state": …}` names; `undefined` for anything else. */
export function stateKeyOf(value: PropValue): string | undefined {
  return referenceOf(value, "$state");
}

function referenceOf(
  value: PropValue,
  key: "$view" | "$state",
): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const named = Object.entries(value).find(([name]) => {
    return name === key;
  })?.[1];

  return typeof named === "string" ? named : undefined;
}
