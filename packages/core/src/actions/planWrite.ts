import type {
  ActionType,
  JsonValue,
  ObjectType,
  Ontology,
  Problem,
} from "@origamic/spec";

import type {
  ActionInvocation,
  ObjectId,
  StoredObject,
} from "#/ports/objectStorePort.ts";

import { type Property, valueSchema } from "../ontology/valueSchema.ts";

/** One write to the store, as the checks of an action leave it. A store carries it out and decides nothing. */
export type ObjectWrite =
  | {
      kind: "create";
      type: string;
      typeVersion: number;
      values: Record<string, JsonValue>;
    }
  | {
      kind: "update";
      id: ObjectId;
      typeVersion: number;
      /** Every value the object has after the update: what it had, with what the input sets. */
      values: Record<string, JsonValue>;
    }
  | { kind: "delete"; id: ObjectId }
  | { kind: "link"; linkType: string; from: ObjectId; to: ObjectId };

/** The write an invocation makes, or every reason it may not. */
export type PlannedWrite =
  | { kind: "write"; write: ObjectWrite }
  | { kind: "rejected"; problems: Problem[] };

/**
 * Where an action is checked (ADR-0009, the plan's decision 4): every
 * `ObjectStore` calls this in `execute`, before it writes, and writes nothing
 * when it is refused. Pure, so the simulator and the Supabase adapter hold
 * the same rules.
 *
 * - The action is the ontology's, at the version the app binds or an older
 *   one. An older version runs while every field its input sets is still
 *   set by the action.
 * - Each value is of its property's type (`valueSchema`), and a `range` rule
 *   bounds a number.
 * - A property required on the type, or by a `required` rule, has a value
 *   after the write. A create fills each property's `default`, and so does
 *   an update, for an object written before the property existed.
 * - A `null` in the input clears an optional property.
 * - An update writes the type's current version, keeping every value the
 *   object had (ADR-0005: an object written at `Book@1` is still a book).
 *
 * `target` is the object `invocation.target` names, as the store holds it,
 * or `null` when there is none.
 */
export function planWrite(
  ontology: Ontology,
  invocation: ActionInvocation,
  target: StoredObject | null,
): PlannedWrite {
  const action = ontology.actionTypes.find((candidate) => {
    return candidate.name === invocation.action;
  });

  if (action === undefined) {
    return rejected(
      "action",
      `the ontology has no action "${invocation.action}"`,
    );
  }

  if (invocation.version > action.version) {
    return rejected(
      "version",
      `"${action.name}@${invocation.version}" is not an action the ontology has; "${action.name}" is at ${action.version}`,
    );
  }

  const unset = fieldsNotSet(action, invocation);

  if (action.kind === "link") {
    return planLink(ontology, action, invocation, target, unset);
  }

  const type = ontology.objectTypes.find((candidate) => {
    return candidate.name === action.type;
  });

  if (type === undefined) {
    return rejected(
      "action",
      `"${action.name}" writes "${action.type}", which the ontology does not have`,
    );
  }

  if (action.kind === "create") {
    return planValues(type, action, invocation, {}, unset, (values) => {
      return {
        kind: "create",
        type: type.name,
        typeVersion: type.version,
        values,
      };
    });
  }

  const acted = actedOn(action.name, action.type, invocation, target);

  if (acted.kind === "refused") {
    return { kind: "rejected", problems: [...unset, acted.problem] };
  }

  const { object } = acted;

  if (action.kind === "delete") {
    return unset.length > 0
      ? { kind: "rejected", problems: unset }
      : { kind: "write", write: { kind: "delete", id: object.id } };
  }

  return planValues(
    type,
    action,
    invocation,
    object.values,
    unset,
    (values) => {
      return {
        kind: "update",
        id: object.id,
        typeVersion: type.version,
        values,
      };
    },
  );
}

interface WritesValues {
  kind: "create" | "update";
}

interface Links {
  kind: "link";
}

type ValueAction = Extract<ActionType, WritesValues>;
type LinkAction = Extract<ActionType, Links>;

/** The values after the write, checked against the type and the action's rules. */
function planValues(
  type: ObjectType,
  action: ValueAction,
  invocation: ActionInvocation,
  before: Readonly<Record<string, JsonValue>>,
  unset: Problem[],
  write: (values: Record<string, JsonValue>) => ObjectWrite,
): PlannedWrite {
  const properties = new Map(
    type.properties.map((property) => {
      return [property.name, property];
    }),
  );
  const values = new Map(Object.entries(before));
  const problems = [...unset];

  for (const [field, value] of Object.entries(invocation.input)) {
    const property = properties.get(field);

    if (property === undefined || !action.fields.includes(field)) {
      continue;
    }

    if (value === null) {
      values.delete(field);
      continue;
    }

    const message = valueProblem(property, action, value);

    if (message !== undefined) {
      problems.push({ path: field, message });
    }

    values.set(field, value);
  }

  for (const property of type.properties) {
    if (!values.has(property.name) && property.default !== undefined) {
      values.set(property.name, property.default);
    }

    if (isRequired(property, action) && isEmpty(values.get(property.name))) {
      problems.push({
        path: property.name,
        message: `"${property.name}" is required`,
      });
    }
  }

  return problems.length > 0
    ? { kind: "rejected", problems }
    : { kind: "write", write: write(Object.fromEntries(values)) };
}

function planLink(
  ontology: Ontology,
  action: LinkAction,
  invocation: ActionInvocation,
  target: StoredObject | null,
  unset: Problem[],
): PlannedWrite {
  const link = ontology.linkTypes.find((candidate) => {
    return candidate.name === action.linkType;
  });

  if (link === undefined) {
    return rejected(
      "action",
      `"${action.name}" links by "${action.linkType}", which the ontology does not have`,
    );
  }

  const to = Object.hasOwn(invocation.input, "to")
    ? invocation.input.to
    : undefined;
  const acted = actedOn(action.name, link.from, invocation, target);
  const problems = [...unset];

  if (acted.kind === "refused") {
    problems.push(acted.problem);
  }

  if (typeof to !== "string" || to === "") {
    problems.push({
      path: "to",
      message: `"${action.name}" needs the id of the object it links to`,
    });
  }

  if (
    acted.kind === "refused" ||
    typeof to !== "string" ||
    problems.length > 0
  ) {
    return { kind: "rejected", problems };
  }

  return {
    kind: "write",
    write: { kind: "link", linkType: link.name, from: acted.object.id, to },
  };
}

/** Each field of the input the action does not set, worded for the version the app binds. */
function fieldsNotSet(
  action: ActionType,
  invocation: ActionInvocation,
): Problem[] {
  const fields =
    action.kind === "link"
      ? ["to"]
      : action.kind === "delete"
        ? []
        : action.fields;

  return Object.keys(invocation.input)
    .filter((field) => {
      return !fields.includes(field);
    })
    .map((field) => {
      return {
        path: field,
        message:
          invocation.version < action.version
            ? `"${action.name}" no longer sets "${field}": the app binds version ${invocation.version}, and it is at ${action.version}`
            : `"${action.name}" does not set "${field}"`,
      };
    });
}

/** The object an action acts on, or why it will not do. */
type ActedOn =
  | { kind: "found"; object: StoredObject }
  | { kind: "refused"; problem: Problem };

function actedOn(
  action: string,
  type: string,
  invocation: ActionInvocation,
  target: StoredObject | null,
): ActedOn {
  if (invocation.target === undefined) {
    return refusedTarget(`"${action}" acts on an object, and names none`);
  }

  if (target === null) {
    return refusedTarget(
      `"${action}" acts on "${invocation.target}", which is not there`,
    );
  }

  if (target.type !== type) {
    return refusedTarget(
      `"${action}" acts on a "${type}", and "${target.id}" is a "${target.type}"`,
    );
  }

  return { kind: "found", object: target };
}

function refusedTarget(message: string): ActedOn {
  return { kind: "refused", problem: { path: "target", message } };
}

/** What is wrong with a value the input sets, by its property's type and then by the action's range. */
function valueProblem(
  property: Property,
  action: ValueAction,
  value: JsonValue,
): string | undefined {
  const parsed = valueSchema(property).safeParse(value);

  if (!parsed.success) {
    return parsed.error.issues[0]?.message;
  }

  for (const rule of action.rules) {
    if (
      rule.kind !== "range" ||
      rule.property !== property.name ||
      typeof value !== "number"
    ) {
      continue;
    }

    if (rule.min !== undefined && value < rule.min) {
      return `"${property.name}" is at least ${rule.min}`;
    }

    if (rule.max !== undefined && value > rule.max) {
      return `"${property.name}" is at most ${rule.max}`;
    }
  }

  return undefined;
}

/** Required on the type, or by a rule of this action. A deprecated property is left out of new writes, so nothing requires it. */
function isRequired(property: Property, action: ValueAction): boolean {
  if (property.deprecated) {
    return false;
  }

  return (
    property.required ||
    action.rules.some((rule) => {
      return rule.kind === "required" && rule.property === property.name;
    })
  );
}

/** No value, or an empty string, which is what a form sends for a field left blank. */
function isEmpty(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || value === "";
}

function rejected(path: string, message: string): PlannedWrite {
  return { kind: "rejected", problems: [{ path, message }] };
}
