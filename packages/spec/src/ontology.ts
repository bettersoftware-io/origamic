import { z } from "zod";

import { ActionType, ActionTypeDraft } from "./action.ts";
import { Format, Name, OntologyVersion, PropName, Version } from "./common.ts";
import { firstDuplicate, type Path, report } from "./refine.ts";

const PropertyShared = z.strictObject({
  name: PropName,
  description: z.string().optional(),
  /** An object written before a property was added has no value for it, so a required property is added with a `default`. */
  required: z.boolean().default(false),
  /** Deprecating is how a property is removed: it stays in the data and leaves new specs (ADR-0005). */
  deprecated: z.boolean().default(false),
});

/** A property, and the type of its value. A `default` is of that type. */
const Property = z.discriminatedUnion("type", [
  PropertyShared.extend({
    type: z.literal("string"),
    default: z.string().optional(),
  }),
  PropertyShared.extend({
    type: z.literal("text"),
    default: z.string().optional(),
  }),
  PropertyShared.extend({
    type: z.literal("number"),
    default: z.number().optional(),
  }),
  PropertyShared.extend({
    type: z.literal("integer"),
    default: z.number().int().optional(),
  }),
  PropertyShared.extend({
    type: z.literal("boolean"),
    default: z.boolean().optional(),
  }),
  PropertyShared.extend({
    type: z.literal("date"),
    default: z.iso.date().optional(),
  }),
  PropertyShared.extend({
    type: z.literal("datetime"),
    default: z.iso.datetime().optional(),
  }),
  PropertyShared.extend({
    type: z.literal("enum"),
    values: z.array(z.string().min(1)).min(1),
    default: z.string().optional(),
  }).superRefine((property, ctx) => {
    const twice = firstDuplicate(property.values);

    if (twice !== undefined) {
      report(
        ctx,
        ["values"],
        `"${twice}" is listed twice among the values of "${property.name}"`,
      );
    }

    if (
      property.default !== undefined &&
      !property.values.includes(property.default)
    ) {
      report(
        ctx,
        ["default"],
        `the default "${property.default}" of "${property.name}" is not one of its values`,
      );
    }
  }),
]);

/** An object type as a change set adds it: the ontology gives it its version. */
const ObjectTypeDraft = z.strictObject({
  name: Name,
  description: z.string().optional(),
  properties: z.array(Property).min(1),
  /** The property that names an instance, as a row's title. */
  titleProperty: PropName,
});

/** An object type at one of its own versions, which moves only when a change set changes this type (ADR-0005). */
export const ObjectType = ObjectTypeDraft.extend({ version: Version });
export type ObjectType = z.infer<typeof ObjectType>;

/** Inside one ontology version, a link type names its two ends by name (ADR-0008). */
const LinkType = z.strictObject({
  name: Name,
  from: Name,
  to: Name,
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-many"]),
});

/** One owner's ontology: every type, link and action their apps can bind. */
export const Ontology = z
  .strictObject({
    format: Format,
    version: OntologyVersion,
    objectTypes: z.array(ObjectType),
    linkTypes: z.array(LinkType).default([]),
    actionTypes: z.array(ActionType).default([]),
  })
  .superRefine(checkOntology);
export type Ontology = z.infer<typeof Ontology>;

/** One operation of a change set. There is no rename in v1: a property's name is its key in the stored data. */
const Operation = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("addObjectType"),
    objectType: ObjectTypeDraft,
  }),
  z.strictObject({
    op: z.literal("addProperty"),
    type: Name,
    property: Property,
  }),
  z.strictObject({
    op: z.literal("deprecateProperty"),
    type: Name,
    property: PropName,
  }),
  z.strictObject({ op: z.literal("addLinkType"), linkType: LinkType }),
  z.strictObject({
    op: z.literal("addActionType"),
    actionType: ActionTypeDraft,
  }),
  z.strictObject({
    op: z.literal("replaceActionType"),
    actionType: ActionTypeDraft,
  }),
]);

/** The ontology changes only through change sets, applied whole, and only to the version they were written against. */
export const ChangeSet = z.strictObject({
  format: Format,
  baseVersion: OntologyVersion,
  operations: z.array(Operation).min(1),
});
export type ChangeSet = z.infer<typeof ChangeSet>;

interface OntologyFields {
  objectTypes: ObjectType[];
  linkTypes: z.infer<typeof LinkType>[];
  actionTypes: ActionType[];
}

/** What one ontology can be wrong about without anything else to compare it with. */
function checkOntology(ontology: OntologyFields, ctx: z.RefinementCtx): void {
  const types = new Map(
    ontology.objectTypes.map((type) => {
      return [type.name, type];
    }),
  );

  const linkNames = new Set(
    ontology.linkTypes.map((link) => {
      return link.name;
    }),
  );

  reportDuplicate(
    ctx,
    ["objectTypes"],
    "object type",
    namesOf(ontology.objectTypes),
  );
  reportDuplicate(ctx, ["linkTypes"], "link type", namesOf(ontology.linkTypes));
  reportDuplicate(
    ctx,
    ["actionTypes"],
    "action",
    namesOf(ontology.actionTypes),
  );

  ontology.objectTypes.forEach((type, index) => {
    checkObjectType(type, ["objectTypes", index], ctx);
  });

  ontology.linkTypes.forEach((link, index) => {
    for (const end of ["from", "to"] as const) {
      if (!types.has(link[end])) {
        report(
          ctx,
          ["linkTypes", index, end],
          `the link "${link.name}" ends at "${link[end]}", which is not an object type`,
        );
      }
    }
  });

  ontology.actionTypes.forEach((action, index) => {
    const path = ["actionTypes", index];

    if (action.kind === "link") {
      if (!linkNames.has(action.linkType)) {
        report(
          ctx,
          [...path, "linkType"],
          `the action "${action.name}" links by "${action.linkType}", which is not a link type`,
        );
      }

      return;
    }

    const type = types.get(action.type);

    if (type === undefined) {
      report(
        ctx,
        [...path, "type"],
        `the action "${action.name}" writes "${action.type}", which is not an object type`,
      );

      return;
    }

    checkActionFields(action, type, path, ctx);
  });
}

function checkObjectType(
  type: ObjectType,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  const twice = firstDuplicate(namesOf(type.properties));

  if (twice !== undefined) {
    report(
      ctx,
      [...path, "properties"],
      `"${type.name}" has two properties named "${twice}"`,
    );
  }

  const title = type.properties.find((property) => {
    return property.name === type.titleProperty;
  });

  if (title === undefined || title.deprecated) {
    report(
      ctx,
      [...path, "titleProperty"],
      `the title property "${type.titleProperty}" of "${type.name}" is not one of its properties in use`,
    );
  }
}

/** An action sets only properties its type has and has not deprecated, and its rules speak only of what it sets. */
function checkActionFields(
  action: ActionType,
  type: ObjectType,
  path: Path,
  ctx: z.RefinementCtx,
): void {
  const fields = "fields" in action ? action.fields : [];

  fields.forEach((field, index) => {
    const property = type.properties.find((candidate) => {
      return candidate.name === field;
    });

    if (property === undefined || property.deprecated) {
      report(
        ctx,
        [...path, "fields", index],
        `the action "${action.name}" sets "${field}", which "${type.name}" does not have in use`,
      );
    }
  });

  action.rules.forEach((rule, index) => {
    if (!fields.includes(rule.property)) {
      report(
        ctx,
        [...path, "rules", index],
        `a rule of "${action.name}" is about "${rule.property}", which the action does not set`,
      );
    }
  });
}

function reportDuplicate(
  ctx: z.RefinementCtx,
  path: Path,
  what: string,
  names: string[],
): void {
  const twice = firstDuplicate(names);

  if (twice !== undefined) {
    report(ctx, path, `two of the ontology's ${what}s are named "${twice}"`);
  }
}

interface Named {
  name: string;
}

function namesOf(items: readonly Named[]): string[] {
  return items.map((item) => {
    return item.name;
  });
}
