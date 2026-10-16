import { z } from "zod";

import { Id, Json, Name, PropName } from "./common.ts";
import { type Path, report, withoutProtoKey } from "./refine.ts";

/** A plain JSON value. A key that starts with `$` is kept for a reference, so a misspelt one is not taken for data. */
const Literal = Json.refine(
  (value) => {
    return !hasReservedKey(value);
  },
  {
    message:
      "a key that starts with $ names a reference: $view, $state or $event",
  },
);

/** The rows of a view the app declares. */
const ViewRef = z.strictObject({ $view: Id });

/** A value the app keeps, by its key in `state`. */
const StateRef = z.strictObject({ $state: PropName });

/** A field of what the event that runs a handler carries, such as the values a form submits. */
const EventRef = z.strictObject({ $event: PropName });

/** What a prop holds: a plain value, or what it reads. */
const PropValue = z.union([ViewRef, StateRef, Literal]);

/** What a handler computes a value from. */
const Expression = z.union([StateRef, EventRef, Literal]);

/** What happens on an event: a state key is set, or an action is invoked with input built from the event and the state. */
const Handler = z.discriminatedUnion("do", [
  z.strictObject({ do: z.literal("set"), state: PropName, to: Expression }),
  z.strictObject({
    do: z.literal("invoke"),
    action: PropName,
    /** The id of the object an `update`, a `delete` or a `link` acts on. */
    target: Expression.optional(),
    input: withoutProtoKey(z.record(PropName, Expression)).default({}),
  }),
]);
type Handler = z.infer<typeof Handler>;

/** One element of the spec: a catalog component, its props, the ids of its children, and what it does on each event it emits. */
export const Element = z.strictObject({
  component: z.string().min(1),
  props: withoutProtoKey(z.record(z.string().min(1), PropValue)).default({}),
  children: z.array(Id).default([]),
  on: withoutProtoKey(z.record(PropName, z.array(Handler).min(1))).default({}),
});
export type Element = z.infer<typeof Element>;

/** A filter whose value reads a state key that holds `null` is left out: that is how "every status" is said. */
const Filter = z.strictObject({
  property: PropName,
  op: z.enum(["eq", "neq", "contains", "gt", "lt"]),
  value: z.union([StateRef, Literal]),
});

/** A read of one type the app binds, by the type's name. Views never write. */
export const View = z.strictObject({
  type: Name,
  filter: z.array(Filter).default([]),
  sort: z
    .array(z.strictObject({ property: PropName, dir: z.enum(["asc", "desc"]) }))
    .default([]),
  limit: z.number().int().positive().optional(),
});
export type View = z.infer<typeof View>;

/** A value the app keeps between events, and what it holds at first. */
const StateDeclaration = z.strictObject({
  initial: Literal.default(null),
});

const uiSpecFields = z.strictObject({
  root: Id,
  elements: withoutProtoKey(z.record(Id, Element)),
  views: withoutProtoKey(z.record(Id, View)).default({}),
  state: withoutProtoKey(z.record(PropName, StateDeclaration)).default({}),
});

/**
 * A flat map of elements: `children` are ids, never elements (ADR-0002).
 * What the spec alone can be wrong about is found here: a broken link
 * between elements, a view or a state key nobody declared. What needs the
 * ontology or the catalog is found by `checkApp`.
 */
export const UiSpec = uiSpecFields.superRefine(checkUiSpec);
export type UiSpec = z.infer<typeof UiSpec>;

type UiSpecFields = z.infer<typeof uiSpecFields>;

function checkUiSpec(ui: UiSpecFields, ctx: z.RefinementCtx): void {
  checkTree(ui, ctx);

  for (const [id, element] of Object.entries(ui.elements)) {
    const path = ["elements", id];

    for (const [prop, value] of Object.entries(element.props)) {
      checkReference(ui, value, [...path, "props", prop], ctx);
    }

    for (const [event, handlers] of Object.entries(element.on)) {
      handlers.forEach((handler, index) => {
        checkHandler(ui, handler, [...path, "on", event, index], ctx);
      });
    }
  }

  for (const [id, view] of Object.entries(ui.views)) {
    view.filter.forEach((filter, index) => {
      checkReference(
        ui,
        filter.value,
        ["views", id, "filter", index, "value"],
        ctx,
      );
    });
  }
}

/** Every element is reached from the root along exactly one path. A loop leaves its elements unreached, so it is reported as that. */
function checkTree(ui: UiSpecFields, ctx: z.RefinementCtx): void {
  if (!Object.hasOwn(ui.elements, ui.root)) {
    report(ctx, ["root"], `the root "${ui.root}" is not an element`);

    return;
  }

  const parents = new Map<string, string>();

  for (const [id, element] of Object.entries(ui.elements)) {
    element.children.forEach((child, index) => {
      const path = ["elements", id, "children", index];
      const parent = parents.get(child);

      if (!Object.hasOwn(ui.elements, child)) {
        report(
          ctx,
          path,
          `"${id}" has a child "${child}" that is not an element`,
        );
      } else if (child === ui.root) {
        report(ctx, path, `"${id}" has the root "${child}" as a child`);
      } else if (parent !== undefined) {
        report(
          ctx,
          path,
          `"${child}" is a child of both "${parent}" and "${id}"`,
        );
      } else {
        parents.set(child, id);
      }
    });
  }

  const reached = reachedFrom(ui.root, ui.elements);

  for (const id of Object.keys(ui.elements)) {
    if (!reached.has(id)) {
      report(
        ctx,
        ["elements", id],
        `"${id}" is not reached from the root "${ui.root}"; it may be part of a loop`,
      );
    }
  }
}

function checkHandler(
  ui: UiSpecFields,
  handler: Handler,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  if (handler.do === "set") {
    if (!Object.hasOwn(ui.state, handler.state)) {
      report(
        ctx,
        [...path, "state"],
        `a handler sets "${handler.state}", which is not declared in state`,
      );
    }

    checkReference(ui, handler.to, [...path, "to"], ctx);

    return;
  }

  if (handler.target !== undefined) {
    checkReference(ui, handler.target, [...path, "target"], ctx);
  }

  for (const [field, value] of Object.entries(handler.input)) {
    checkReference(ui, value, [...path, "input", field], ctx);
  }
}

/** A `$view` names a declared view and a `$state` a declared state key. A literal names nothing. */
function checkReference(
  ui: UiSpecFields,
  value: unknown,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  const view = ViewRef.safeParse(value);

  if (view.success && !Object.hasOwn(ui.views, view.data.$view)) {
    report(ctx, path, `"${view.data.$view}" is not a declared view`);
  }

  const state = StateRef.safeParse(value);

  if (state.success && !Object.hasOwn(ui.state, state.data.$state)) {
    report(ctx, path, `"${state.data.$state}" is not declared in state`);
  }
}

function reachedFrom(
  root: string,
  elements: Record<string, Element>,
): Set<string> {
  const reached = new Set<string>();
  const waiting = [root];

  for (let id = waiting.pop(); id !== undefined; id = waiting.pop()) {
    if (!reached.has(id)) {
      reached.add(id);
      waiting.push(...(elements[id]?.children ?? []));
    }
  }

  return reached;
}

function hasReservedKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasReservedKey);
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, inner]) => {
      return key.startsWith("$") || hasReservedKey(inner);
    });
  }

  return false;
}
