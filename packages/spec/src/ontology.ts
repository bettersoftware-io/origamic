import { z } from "zod";

import { Id, Name, PropName, SemVerish, TypeRef } from "./common.ts";

export const PropertyType = z.enum([
  "string",
  "text",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "enum",
]);

export const Property = z.object({
  name: PropName,
  type: PropertyType,
  required: z.boolean().default(false),
  enumValues: z.array(z.string()).optional(), // when type === "enum"
  description: z.string().optional(),
});

export const ObjectType = z.object({
  name: Name,
  description: z.string().optional(),
  properties: z.array(Property).min(1),
  titleProperty: PropName, // which property names an instance
});

export const LinkType = z.object({
  name: Name,
  from: Name,
  to: Name,
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-many"]),
});

export const Ontology = z.object({
  version: SemVerish,
  objectTypes: z.array(ObjectType),
  linkTypes: z.array(LinkType),
});
export type Ontology = z.infer<typeof Ontology>;

/** The ontology changes only through migrations, stored as data. */
export const OntologyMigration = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addObjectType"), objectType: ObjectType }),
  z.object({ op: z.literal("addProperty"), type: Name, property: Property }),
  z.object({
    op: z.literal("deprecateProperty"),
    type: Name,
    property: PropName,
  }),
  z.object({
    op: z.literal("renameProperty"),
    type: Name,
    from: PropName,
    to: PropName,
  }),
  z.object({ op: z.literal("addLinkType"), linkType: LinkType }),
]);
export type OntologyMigration = z.infer<typeof OntologyMigration>;

export const ObjectInstance = z.object({
  id: Id,
  ref: TypeRef,
  data: z.record(z.string(), z.unknown()),
});
