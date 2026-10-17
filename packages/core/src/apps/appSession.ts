import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  map,
  type Observable,
  Subject,
  switchMap,
  takeUntil,
  throwError,
} from "rxjs";

import type {
  App,
  Element,
  JsonValue,
  ObjectType,
  Ontology,
  Problem,
  Row,
} from "@origamic/spec";

import type {
  ActionInvocation,
  ObjectStorePort,
  StoredObject,
  ViewQuery,
} from "#/ports/objectStorePort.ts";
import type { OntologyStorePort } from "#/ports/ontologyStorePort.ts";

import { resolveView, type StateValues, stateValue } from "./resolveView.ts";

/**
 * One app, open: the state its UI spec declares, the rows of its views, the
 * problems on its elements, and the events its elements emit (ADR-0002).
 * Everything an app keeps lives here, in `core`, never in a component.
 */
export interface AppSession {
  /** Every state key and its value: each key's `initial` at first, then as handlers set it. */
  state(): Observable<StateValues>;
  /**
   * The rows of a view, again whenever the state it reads or the objects
   * change. A property an object lacks reads as its `default`, and a
   * deprecated property is left out. A view the app does not declare fails.
   */
  rows(viewId: string): Observable<readonly Row[]>;
  /** What the element's last event was refused for; `[]` when nothing was. */
  problems(elementId: string): Observable<readonly Problem[]>;
  /**
   * Runs the element's handlers for the event, in order, after the events
   * emitted before it. A `set` changes the state at once. An `invoke` builds
   * its input from the payload and the state and executes the action; when
   * it is refused, its problems go on the element and the handlers after it
   * do not run. The element's problems are cleared first. Resolves once the
   * handlers are done, so `problems(elementId)` then says whether they all
   * ran. An element the app does not declare, or a closed session, rejects;
   * an event still queued when the session closes rejects without running,
   * and one under way runs no handler after the close.
   */
  emit(
    elementId: string,
    event: string,
    payload: Readonly<Record<string, JsonValue>>,
  ): Promise<void>;
  /** Ends every stream of the session. */
  close(): void;
}

/** The ports an open app reads and writes through. */
export interface AppSessionPorts {
  ontology: OntologyStorePort;
  objects: ObjectStorePort;
}

/** Opens `app`: its state at each key's initial value, and no problems. */
export function openAppSession(app: App, ports: AppSessionPorts): AppSession {
  const state = new BehaviorSubject<StateValues>(initialState(app));
  const problems = new BehaviorSubject<ProblemsByElement>(new Map());
  const closed = new Subject<void>();
  const versions = new Map(
    app.bindings.actions.map((ref) => {
      return [ref.action, ref.version];
    }),
  );
  let queue: Promise<void> = Promise.resolve();
  let open = true;

  function setProblems(elementId: string, found: readonly Problem[]): void {
    const next = new Map(problems.getValue());

    next.set(elementId, found);
    problems.next(next);
  }

  /** The handlers of one event, in order, up to the first invocation refused. */
  async function run(
    elementId: string,
    element: Element,
    event: string,
    payload: Readonly<Record<string, JsonValue>>,
  ): Promise<void> {
    const handlers = Object.hasOwn(element.on, event)
      ? (element.on[event] ?? [])
      : [];

    if (!open) {
      throw new Error("the app session is closed");
    }

    setProblems(elementId, NONE);

    for (const handler of handlers) {
      // An event queued, or one waiting on its store, stops when the session closes.
      if (!open) {
        return;
      }

      if (handler.do === "set") {
        const value = evaluate(handler.to, payload, state.getValue()) ?? null;

        state.next({ ...state.getValue(), [handler.state]: value });
        continue;
      }

      // The app's schema refuses an invocation of an action it does not
      // bind, so the version is always found; were it not, `planWrite`
      // refuses version 0.
      const version = versions.get(handler.action) ?? 0;
      const result = await ports.objects.execute(
        invocationOf(handler, version, payload, state.getValue()),
      );

      if (result.kind === "rejected") {
        setProblems(elementId, result.problems);

        return;
      }
    }
  }

  return {
    state: (): Observable<StateValues> => {
      return state.pipe(takeUntil(closed));
    },
    rows: (viewId: string): Observable<readonly Row[]> => {
      const view = Object.hasOwn(app.ui.views, viewId)
        ? app.ui.views[viewId]
        : undefined;

      if (view === undefined) {
        return throwError(() => {
          return new Error(`the app has no view "${viewId}"`);
        });
      }

      const objects = state.pipe(
        map((values) => {
          return resolveView(view, values);
        }),
        distinctUntilChanged(sameQuery),
        switchMap((query) => {
          return ports.objects.view(query);
        }),
      );

      return combineLatest([objects, ports.ontology.current()]).pipe(
        map(([stored, ontology]) => {
          return rowsOf(stored, ontology);
        }),
        takeUntil(closed),
      );
    },
    problems: (elementId: string): Observable<readonly Problem[]> => {
      return problems.pipe(
        map((byElement) => {
          return byElement.get(elementId) ?? NONE;
        }),
        distinctUntilChanged(),
        takeUntil(closed),
      );
    },
    emit: (
      elementId: string,
      event: string,
      payload: Readonly<Record<string, JsonValue>>,
    ): Promise<void> => {
      const element = Object.hasOwn(app.ui.elements, elementId)
        ? app.ui.elements[elementId]
        : undefined;

      if (!open) {
        return Promise.reject(new Error("the app session is closed"));
      }

      if (element === undefined) {
        return Promise.reject(
          new Error(`the app has no element "${elementId}"`),
        );
      }

      const ran = queue.then(() => {
        return run(elementId, element, event, payload);
      });

      queue = ran.catch(() => {
        return undefined;
      });

      return ran;
    },
    close: (): void => {
      open = false;
      closed.next();
      closed.complete();
      state.complete();
      problems.complete();
    },
  };
}

type ProblemsByElement = ReadonlyMap<string, readonly Problem[]>;
type Handler = Element["on"][string][number];
type Invoke = Extract<Handler, Invokes>;
type Expression = Extract<Handler, Sets>["to"];

interface Invokes {
  do: "invoke";
}

interface Sets {
  do: "set";
}

const NONE: readonly Problem[] = [];

function initialState(app: App): StateValues {
  return Object.fromEntries(
    Object.entries(app.ui.state).map(([key, declared]) => {
      return [key, declared.initial];
    }),
  );
}

/** The invocation a handler makes: each input field from the payload or the state, and a field the payload does not carry left out. */
function invocationOf(
  handler: Invoke,
  version: number,
  payload: Readonly<Record<string, JsonValue>>,
  state: StateValues,
): ActionInvocation {
  const input: Record<string, JsonValue> = {};

  for (const [field, expression] of Object.entries(handler.input)) {
    const value = evaluate(expression, payload, state);

    if (value !== undefined) {
      input[field] = value;
    }
  }

  const target =
    handler.target === undefined
      ? undefined
      : evaluate(handler.target, payload, state);

  return typeof target === "string"
    ? { action: handler.action, version, target, input }
    : { action: handler.action, version, input };
}

/**
 * The value an expression has for this event: a field of the payload, a
 * state key's value, or the literal itself. A field the payload does not
 * carry is `undefined`: a form leaves an empty field out, so the action
 * takes its default or keeps its value rather than a `null`.
 */
function evaluate(
  expression: Expression,
  payload: Readonly<Record<string, JsonValue>>,
  state: StateValues,
): JsonValue | undefined {
  if (isRef(expression, "$event")) {
    return Object.hasOwn(payload, expression.$event)
      ? payload[expression.$event]
      : undefined;
  }

  if (isRef(expression, "$state")) {
    return stateValue(state, expression.$state);
  }

  return expression;
}

type Ref<K extends string> = Readonly<Record<K, string>>;

/** A reference, `{"$event": …}` or `{"$state": …}`. A literal never has a `$` key: the spec refuses one. */
function isRef<K extends "$event" | "$state">(
  expression: Expression,
  key: K,
): expression is Extract<Expression, Ref<K>> {
  return (
    expression !== null &&
    typeof expression === "object" &&
    !Array.isArray(expression) &&
    Object.hasOwn(expression, key)
  );
}

/** Each object as a row of the current ontology: a property it lacks reads as its default, and a deprecated one is left out. */
function rowsOf(stored: readonly StoredObject[], ontology: Ontology): Row[] {
  const types = new Map(
    ontology.objectTypes.map((type) => {
      return [type.name, type];
    }),
  );

  return stored.map((object) => {
    const type = types.get(object.type);

    return {
      id: object.id,
      values: type === undefined ? object.values : valuesOf(object, type),
    };
  });
}

function valuesOf(
  object: StoredObject,
  type: ObjectType,
): Record<string, JsonValue> {
  const values: Record<string, JsonValue> = {};

  for (const property of type.properties) {
    if (property.deprecated) {
      continue;
    }

    if (Object.hasOwn(object.values, property.name)) {
      values[property.name] = object.values[property.name] ?? null;
    } else if (property.default !== undefined) {
      values[property.name] = property.default;
    }
  }

  return values;
}

function sameQuery(left: ViewQuery, right: ViewQuery): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
