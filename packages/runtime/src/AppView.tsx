import { type ReactElement, useState } from "react";
import { firstValueFrom } from "rxjs";

import { type Envelope, implementations } from "@origamic/catalog";
import { catalog } from "@origamic/catalog/manifest";
import type { AppSession } from "@origamic/core";
import type { App, Element, Problem } from "@origamic/spec";

import {
  type AppSnapshot,
  LOADING,
  messageOf,
  showApp,
} from "./appSnapshot.ts";
import { elementTestId } from "./elementTestId.ts";
import { resolveProps } from "./resolveProps.ts";
import { useObservable } from "./viewModel/useObservable.ts";

/**
 * An app's UI spec, drawn over the catalog. The tree is rebuilt from the
 * flat map of elements (ADR-0002), from the root down; each element's props
 * are resolved by kind from the session's state and views, and each event it
 * emits runs its handlers in the session.
 */
export function AppView({ app, session }: AppViewProps): ReactElement {
  return (
    <AppContent
      key={`${app.id}@${String(app.version)}`}
      app={app}
      session={session}
    />
  );
}

export interface AppViewProps {
  app: App;
  session: AppSession;
}

/**
 * The app at one version. A version never changes, so the first `App` it
 * was given stands for every equal one after: a caller that builds the app
 * afresh on each render does not reopen its streams.
 */
function AppContent({ app: given, session }: AppViewProps): ReactElement {
  const [app] = useState(given);
  const shown = useObservable(showApp, [app, session], LOADING);

  switch (shown.kind) {
    case "loading":
      return <p className="text-sm text-muted-foreground">Loading…</p>;
    case "failed":
      return (
        <Unshown
          testId={elementTestId(app.ui.root)}
          message={`The app could not be shown: ${shown.message}`}
        />
      );
    case "shown":
      return (
        <ElementView
          id={app.ui.root}
          app={app}
          session={session}
          snapshot={shown.snapshot}
        />
      );
  }
}

interface ElementViewProps {
  id: string;
  app: App;
  session: AppSession;
  snapshot: AppSnapshot;
}

/**
 * One element and, under it, its children. An element whose event wrote
 * through an action is drawn afresh once every handler has run, so a form
 * that added a book starts empty again; one whose event was refused keeps
 * what was typed, beside the problems.
 */
function ElementView({
  id,
  app,
  session,
  snapshot,
}: ElementViewProps): ReactElement {
  const [drawn, setDrawn] = useState(0);
  const [failure, setFailure] = useState<Problem | null>(null);
  const testId = elementTestId(id);
  const element = ownOf(app.ui.elements, id);

  if (element === undefined) {
    return <Unshown testId={testId} message={`No element "${id}"`} />;
  }

  const Component = ownOf(implementations, element.component);

  if (Component === undefined) {
    return (
      <Unshown
        testId={testId}
        message={`Unknown component "${element.component}"`}
      />
    );
  }

  const shownProblems = ownOf(snapshot.problems, id) ?? NONE;
  const handlers = element.on;

  function runHandlers(event: string, payload: Payload): void {
    setFailure(null);
    // Nothing waits for an event: what it changes comes back through the
    // session's streams, and a failure is shown on the element below.
    void emitThenRedraw(session, id, writes(handlers, event), event, payload)
      .then((redraw) => {
        if (redraw) {
          setDrawn((times) => {
            return times + 1;
          });
        }
      })
      .catch((error: unknown) => {
        setFailure({ path: "", message: messageOf(error) });
      });
  }

  return (
    <Component
      key={drawn}
      props={resolveProps(
        element,
        ownOf(catalog.manifest, element.component)?.props ?? {},
        snapshot,
      )}
      emit={runHandlers}
      testId={testId}
      problems={failure === null ? shownProblems : [...shownProblems, failure]}
    >
      {element.children.map((child) => {
        return (
          <ElementView
            key={child}
            id={child}
            app={app}
            session={session}
            snapshot={snapshot}
          />
        );
      })}
    </Component>
  );
}

interface UnshownProps {
  testId: string;
  message: string;
}

/** What is drawn where an element cannot be. The checks keep it from happening; were they to fail, a blank panel would hide it. */
function Unshown({ testId, message }: UnshownProps): ReactElement {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="rounded-md border border-destructive p-3 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

/** What an event carries, as a component emits it. */
type Payload = Parameters<Envelope<never>["emit"]>[1];

const NONE: readonly Problem[] = [];

/**
 * Runs the element's handlers for the event in the session, and says
 * whether to draw the element afresh: when the event wrote through an action
 * and nothing was refused.
 */
async function emitThenRedraw(
  session: AppSession,
  elementId: string,
  wrote: boolean,
  event: string,
  payload: Payload,
): Promise<boolean> {
  await session.emit(elementId, event, payload);

  const problems = await firstValueFrom(session.problems(elementId), {
    defaultValue: NONE,
  });

  return wrote && problems.length === 0;
}

/** Whether one of an element's handlers for the event invokes an action. */
function writes(handlers: Element["on"], event: string): boolean {
  return (ownOf(handlers, event) ?? []).some((handler) => {
    return handler.do === "invoke";
  });
}

/** A record's own entry, so that a name every object inherits, such as `constructor`, is not taken for one. A spec's ids and component names come from outside. */
function ownOf<T>(
  record: Readonly<Record<string, T>>,
  key: string,
): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
