import type { z } from "zod";

import type { ActionType, ActionTypeDraft } from "./action.ts";
import { type ChangeSet, type ObjectType, Ontology } from "./ontology.ts";
import type { Problem } from "./references.ts";
import { problemsOf } from "./refine.ts";

/** What applying a change set gives: the ontology it yields, the version it should have been written against, or why it cannot be applied. */
export type Applied =
  | { kind: "applied"; ontology: Ontology }
  | { kind: "stale"; current: number }
  | { kind: "invalid"; problems: Problem[] };

/**
 * The ontology a change set yields, applied whole or not at all, and only to
 * the version it was written against (ADR-0005). The ontology moves one
 * version, and so does each type and action the change set adds or changes,
 * however many of its operations touch it. The result is parsed with
 * `Ontology`, so a change set cannot yield an ontology that schema refuses.
 *
 * Pure: the gateway checks the model's app against the ontology as it will
 * be, and `core` applies the change set the builder accepts.
 */
export function applyChangeSet(ontology: Ontology, change: ChangeSet): Applied {
  if (change.baseVersion !== ontology.version) {
    return { kind: "stale", current: ontology.version };
  }

  const next: Working = {
    types: byName(ontology.objectTypes),
    links: byName(ontology.linkTypes),
    actions: byName(ontology.actionTypes),
  };
  const problems: Problem[] = [];

  change.operations.forEach((operation, index) => {
    const message = applyOperation(next, operation);

    if (message !== undefined) {
      problems.push({ path: `operations.${index}`, message });
    }
  });

  if (problems.length > 0) {
    return { kind: "invalid", problems };
  }

  const result = Ontology.safeParse({
    format: ontology.format,
    version: change.baseVersion + 1,
    objectTypes: versioned(next.types, byName(ontology.objectTypes)),
    linkTypes: [...next.links.values()],
    actionTypes: versioned(next.actions, byName(ontology.actionTypes)),
  });

  return result.success
    ? { kind: "applied", ontology: result.data }
    : { kind: "invalid", problems: problemsOf(result.error) };
}

type Operation = ChangeSet["operations"][number];
type Property = ObjectType["properties"][number];
type LinkType = Ontology["linkTypes"][number];

/** The ontology as the operations change it. An operation replaces what it changes and never edits it, so what it leaves alone stays the same object. */
interface Working {
  types: Map<string, ObjectType>;
  links: Map<string, LinkType>;
  actions: Map<string, ActionType>;
}

/** Applies one operation to `next`, or says why it cannot. */
function applyOperation(
  next: Working,
  operation: Operation,
): string | undefined {
  switch (operation.op) {
    case "addObjectType":
      return add(next.types, { ...operation.objectType, version: 1 }, "a type");
    case "addProperty":
      return addProperty(next.types, operation.type, operation.property);
    case "deprecateProperty":
      return deprecateProperty(next.types, operation.type, operation.property);
    case "addLinkType":
      return add(next.links, operation.linkType, "a link type");
    case "addActionType":
      return add(
        next.actions,
        { ...operation.actionType, version: 1 },
        "an action",
      );
    case "replaceActionType":
      return replaceAction(next.actions, operation.actionType);
  }
}

function add<T extends Named>(
  items: Map<string, T>,
  item: T,
  what: string,
): string | undefined {
  if (items.has(item.name)) {
    return `the ontology already has ${what} named "${item.name}"`;
  }

  items.set(item.name, item);

  return undefined;
}

function addProperty(
  types: Map<string, ObjectType>,
  name: string,
  property: Property,
): string | undefined {
  const type = types.get(name);

  if (type === undefined) {
    return `the ontology has no type named "${name}"`;
  }

  if (hasProperty(type, property.name)) {
    return `"${name}" already has a property named "${property.name}"`;
  }

  types.set(name, { ...type, properties: [...type.properties, property] });

  return undefined;
}

/** A deprecated property stays in the data and leaves new specs. The title property names each object, so it cannot leave. */
function deprecateProperty(
  types: Map<string, ObjectType>,
  name: string,
  propertyName: string,
): string | undefined {
  const type = types.get(name);

  if (type === undefined) {
    return `the ontology has no type named "${name}"`;
  }

  if (!hasProperty(type, propertyName)) {
    return `"${name}" has no property named "${propertyName}"`;
  }

  if (propertyName === type.titleProperty) {
    return `"${propertyName}" is the title property of "${name}", which stays in use`;
  }

  types.set(name, {
    ...type,
    properties: type.properties.map((property) => {
      return property.name === propertyName
        ? { ...property, deprecated: true }
        : property;
    }),
  });

  return undefined;
}

function replaceAction(
  actions: Map<string, ActionType>,
  draft: z.infer<typeof ActionTypeDraft>,
): string | undefined {
  const action = actions.get(draft.name);

  if (action === undefined) {
    return `the ontology has no action named "${draft.name}"`;
  }

  actions.set(draft.name, { ...draft, version: action.version });

  return undefined;
}

/** Each item at its version after the change set: one on from `before` if an operation replaced it, 1 if one added it. */
function versioned<T extends Versioned>(
  items: ReadonlyMap<string, T>,
  before: ReadonlyMap<string, T>,
): T[] {
  return [...items.values()].map((item) => {
    const previous = before.get(item.name);

    return item === previous
      ? item
      : { ...item, version: (previous?.version ?? 0) + 1 };
  });
}

function hasProperty(type: ObjectType, name: string): boolean {
  return type.properties.some((property) => {
    return property.name === name;
  });
}

interface Named {
  name: string;
}

interface Versioned extends Named {
  version: number;
}

function byName<T extends Named>(items: readonly T[]): Map<string, T> {
  return new Map(
    items.map((item) => {
      return [item.name, item];
    }),
  );
}
