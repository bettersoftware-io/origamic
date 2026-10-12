import { z } from "zod";

import { Name, PropName, SemVerish, TypeRef } from "./common.ts";

/** Declarative validation vocabulary. Extend this before reaching for code (ADR-0007). */
export const Rule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("required"), property: PropName }),
  z.object({
    kind: z.literal("range"),
    property: PropName,
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    kind: z.literal("oneOf"),
    property: PropName,
    values: z.array(z.string()),
  }),
  z.object({ kind: z.literal("unique"), property: PropName }),
]);

export const ActionEffect = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), target: TypeRef }),
  z.object({ kind: z.literal("update"), target: TypeRef }),
  z.object({ kind: z.literal("delete"), target: TypeRef }),
  z.object({ kind: z.literal("link"), linkType: Name }),
]);

/** Every write is a named action. There is no other write path. */
export const ActionType = z.object({
  version: SemVerish,
  name: PropName,
  description: z.string().optional(),
  input: z.record(
    z.string(),
    z.enum(["string", "number", "boolean", "date", "id"]),
  ),
  rules: z.array(Rule).default([]),
  effect: ActionEffect,
});
export type ActionType = z.infer<typeof ActionType>;

export const ActionInvocation = z.object({
  action: PropName,
  actionVersion: SemVerish,
  input: z.record(z.string(), z.unknown()),
});
