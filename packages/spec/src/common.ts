import { z } from "zod";

export const Id = z.string().min(1);
export const SemVerish = z.number().int().nonnegative(); // monotonically increasing
export const Name = z.string().regex(/^[A-Z][A-Za-z0-9]*$/, "PascalCase");
export const PropName = z.string().regex(/^[a-z][A-Za-z0-9]*$/, "camelCase");

/** A reference to an object type at a specific ontology version. Never bare. */
export const TypeRef = z.object({ type: Name, version: SemVerish });
export type TypeRef = z.infer<typeof TypeRef>;
