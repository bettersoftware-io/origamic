import { z } from "zod";

/** The id of a spec, an object or an element. Never empty. */
export const Id = z.string().min(1);

/** A version of a type, an action, an app or a workspace: 1 when it is made, then one more for each change (ADR-0005). */
export const Version = z.number().int().positive();

/** The ontology's version counts the change sets applied to it, so an empty ontology is at 0. */
export const OntologyVersion = z.number().int().nonnegative();

/** The version of the spec language a stored spec is written in. A change that would reject a stored spec raises it. */
export const Format = z.literal(1);

/** The name of an object type or a link type. */
export const Name = z
  .string()
  .regex(/^[A-Z][A-Za-z0-9]*$/, "a type's name is PascalCase");

/** The name of a property, an action or a state key. */
export const PropName = z
  .string()
  .regex(
    /^[a-z][A-Za-z0-9]*$/,
    "a property's, an action's or a state key's name is camelCase",
  );

/** A plain JSON value: what a property, a state key or an event's field holds. */
export const Json = z.json();
export type JsonValue = z.infer<typeof Json>;

/** A binding to an object type at one of its own versions: `Book@2`. Never a bare name. */
export const TypeRef = z.strictObject({ type: Name, version: Version });
export type TypeRef = z.infer<typeof TypeRef>;
