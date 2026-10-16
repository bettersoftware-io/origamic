import { z } from "zod";

import {
  ChangeSet,
  Id,
  Json,
  Name,
  type Problem,
  PropName,
  type UiSpec,
  View,
} from "@origamic/spec";

import { contracts } from "./contract/contracts.ts";
import type { ComponentContract } from "./contract/defineComponent.ts";
import type { AnyProp } from "./contract/props.ts";

/** A JSON Schema, as `generationSchema` gives it: a type the gateway can name without importing zod. */
export type JsonSchema = z.core.JSONSchema.BaseSchema;

/** What the model proposed, read: the ui as spec's `UiSpec` takes it in, the types and actions by name. The gateway adds each one's version (decision 3 of the first slice's plan). */
export interface Generated {
  explanation: string;
  operations: ChangeSet["operations"] | null;
  app: GeneratedApp;
}

interface GeneratedApp {
  name: string;
  types: string[];
  actions: string[];
  ui: z.input<typeof UiSpec>;
}

/** What `readGenerated` gives: what the model wrote, read, or every problem with it. */
type Read =
  | { kind: "read"; generated: Generated }
  | { kind: "invalid"; problems: Problem[] };

// A record cannot be held to a schema (ADR-0011: every object is closed), so
// the model writes elements, views and state as lists, each entry with its
// id or its key, and an invocation's input as a list of fields.
// `readGenerated` turns each list into spec's map.

/** A plain value the model may write. A JSON object or list could not be described by a closed schema, so a literal is a scalar here. */
const Scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const ViewRef = z.strictObject({ $view: Id });
const StateRef = z.strictObject({ $state: PropName });
const EventRef = z.strictObject({ $event: PropName });
const Expression = z.union([StateRef, EventRef, Scalar]);

/** spec's handler, with an invocation's input as a list of fields. */
const Handler = z.discriminatedUnion("do", [
  z.strictObject({ do: z.literal("set"), state: PropName, to: Expression }),
  z.strictObject({
    do: z.literal("invoke"),
    action: PropName,
    target: Expression.optional(),
    input: z
      .array(z.strictObject({ field: PropName, value: Expression }))
      .optional(),
  }),
]);

/** An element once its component's own schema has accepted it: what `readGenerated` turns into spec's element. */
const ReadElement = z.object({
  id: Id,
  component: z.string(),
  props: z.record(z.string(), z.union([ViewRef, StateRef, Json])).optional(),
  children: z.array(Id).optional(),
  on: z.record(z.string(), z.array(Handler)).optional(),
});

/** spec's view, with its id, and a scalar for a filter's literal. */
const GeneratedView = z.strictObject({
  id: Id,
  type: View.shape.type,
  filter: z
    .array(
      View.shape.filter
        .unwrap()
        .element.extend({ value: z.union([StateRef, Scalar]) }),
    )
    .optional(),
  sort: View.shape.sort.unwrap().optional(),
  limit: View.shape.limit,
});

const GeneratedState = z.strictObject({
  key: PropName,
  initial: Scalar.optional(),
});

/**
 * The model's reply: an explanation, a change set's operations or none, and
 * the app. Its JSON Schema (`io: "input"`) is what the model is held to,
 * built from the contracts; reading a reply parses it with the same schema.
 */
const Reply = z.strictObject({
  explanation: z.string(),
  operations: ChangeSet.shape.operations.nullable(),
  app: z.strictObject({
    name: z.string().min(1),
    types: z.array(Name),
    actions: z.array(PropName),
    ui: z
      .strictObject({
        root: Id,
        elements: z.array(elementsOf(contracts).pipe(ReadElement)).min(1),
        views: z.array(GeneratedView),
        state: z.array(GeneratedState),
      })
      .superRefine((ui, ctx) => {
        reportTwice(ctx, ui.elements, "elements", "id", "elements");
        reportTwice(ctx, ui.views, "views", "id", "views");
        reportTwice(ctx, ui.state, "state", "key", "state keys");
      }),
  }),
});

/** The schema the model is held to (ADR-0006, ADR-0011): one closed object per component, built from its contract. */
export function generationSchema(): JsonSchema {
  return z.toJSONSchema(Reply, {
    io: "input",
    // Zod writes a discriminated union as `oneOf`. Its branches cannot
    // overlap, so `anyOf` says the same, and `anyOf` is what Anthropic's
    // structured outputs accept (ADR-0011).
    override: anyOfForOneOf,
  });
}

interface Converted {
  jsonSchema: JsonSchema;
}

/** Writes a `oneOf` as an `anyOf`. */
function anyOfForOneOf({ jsonSchema }: Converted): void {
  if (jsonSchema.oneOf !== undefined) {
    jsonSchema.anyOf = jsonSchema.oneOf;
    delete jsonSchema.oneOf;
  }
}

/** What the model wrote, held to the schema it was given, with its lists turned into spec's maps. */
export function readGenerated(value: unknown): Read {
  const parsed = Reply.safeParse(value);

  if (!parsed.success) {
    return {
      kind: "invalid",
      problems: parsed.error.issues.map((issue) => {
        return {
          path: issue.path.map(String).join("."),
          message: issue.message,
        };
      }),
    };
  }

  const { explanation, operations, app } = parsed.data;

  return {
    kind: "read",
    generated: { explanation, operations, app: { ...app, ui: uiOf(app.ui) } },
  };
}

type ReadUi = z.output<typeof Reply>["app"]["ui"];
type ReadHandler = z.output<typeof Handler>;
type SpecHandler = NonNullable<
  z.input<typeof UiSpec>["elements"][string]["on"]
>[string][number];

function uiOf({
  root,
  elements,
  views,
  state,
}: ReadUi): z.input<typeof UiSpec> {
  return {
    root,
    elements: Object.fromEntries(
      elements.map(({ id, on, ...element }) => {
        return [
          id,
          on === undefined
            ? element
            : {
                ...element,
                on: Object.fromEntries(
                  Object.entries(on).map(([event, handlers]) => {
                    return [event, handlers.map(handlerOf)];
                  }),
                ),
              },
        ];
      }),
    ),
    views: Object.fromEntries(
      views.map(({ id, ...view }) => {
        return [id, view];
      }),
    ),
    state: Object.fromEntries(
      state.map(({ key, ...declaration }) => {
        return [key, declaration];
      }),
    ),
  };
}

/** spec's handler: an invocation's list of fields becomes its input's map. */
function handlerOf(handler: ReadHandler): SpecHandler {
  if (handler.do === "set") {
    return handler;
  }

  const { input, ...invocation } = handler;

  return input === undefined
    ? invocation
    : {
        ...invocation,
        input: Object.fromEntries(
          input.map(({ field, value }) => {
            return [field, value];
          }),
        ),
      };
}

/** One closed object per component, told apart by `component`. */
function elementsOf(
  catalog: Readonly<Record<string, ComponentContract>>,
): z.ZodType<unknown> {
  const [first, ...rest] = Object.values(catalog).map(elementOf);

  if (first === undefined) {
    throw new Error("the catalog has no component");
  }

  return z.discriminatedUnion("component", [first, ...rest]);
}

/** An element of one component: its props, each as its kind accepts it, and a handler list for each event it emits. A prop the contract requires is required here too. */
function elementOf(
  contract: ComponentContract,
): z.ZodObject<z.ZodRawShape, z.core.$strict> {
  const props = Object.entries(contract.props);
  const shape = z.strictObject(
    Object.fromEntries(
      props.map(([name, prop]) => {
        return [
          name,
          prop.required ? acceptedBy(prop) : acceptedBy(prop).optional(),
        ];
      }),
    ),
  );
  const events = Object.keys(contract.events);
  const anyRequired = props.some(([, prop]) => {
    return prop.required;
  });

  return z
    .strictObject({
      id: Id,
      component: z.literal(contract.name),
      props: anyRequired ? shape : shape.optional(),
      children: z.array(Id).optional(),
      ...(events.length === 0
        ? {}
        : {
            on: z
              .strictObject(
                Object.fromEntries(
                  events.map((event) => {
                    return [event, z.array(Handler).min(1).optional()];
                  }),
                ),
              )
              .optional(),
          }),
    })
    .describe(contract.description);
}

/**
 * What the model may write for a prop, by its kind (ADR-0002): a `view` prop
 * a `$view`, a `fixed` one a value its schema accepts, a `state` one either.
 * A value no closed schema can describe (a record) is offered by its
 * `$state` alone.
 */
function acceptedBy(prop: AnyProp): z.ZodType {
  switch (prop.kind) {
    case "view":
      return ViewRef;
    case "fixed":
      return prop.schema;
    case "state":
      return isClosed(prop.schema)
        ? z.union([prop.schema, StateRef])
        : StateRef;
  }
}

/** Whether a schema's JSON Schema can be held to: every object closed, and no `$ref`, which a recursive value such as a JSON object needs. */
function isClosed(schema: z.ZodType): boolean {
  return everyNode(z.toJSONSchema(schema, { io: "input" }), (node) => {
    return (
      !Object.hasOwn(node, "$ref") &&
      (node.type !== "object" || node.additionalProperties === false)
    );
  });
}

interface Node {
  type?: unknown;
  additionalProperties?: unknown;
}

function everyNode(value: unknown, holds: (node: Node) => boolean): boolean {
  if (Array.isArray(value)) {
    return value.every((item) => {
      return everyNode(item, holds);
    });
  }

  if (typeof value !== "object" || value === null) {
    return true;
  }

  return (
    holds(value) &&
    Object.values(value).every((inner) => {
      return everyNode(inner, holds);
    })
  );
}

/** An issue on each entry whose name an earlier entry already has. */
function reportTwice<K extends string>(
  ctx: z.RefinementCtx,
  entries: readonly Readonly<Record<K, string>>[],
  list: string,
  key: K,
  what: string,
): void {
  const seen = new Set<string>();

  entries.forEach((entry, index) => {
    const name = entry[key];

    if (seen.has(name)) {
      ctx.addIssue({
        code: "custom",
        path: [list, index, key],
        message: `"${name}" names two ${what}`,
      });
    }

    seen.add(name);
  });
}
