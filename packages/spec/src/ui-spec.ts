import { z } from "zod";
import { Id, PropName, SemVerish, TypeRef } from "./common";

/** A read. Views never write. */
export const ViewQuery = z.object({
  source: TypeRef,
  filter: z.array(z.object({ property: PropName, op: z.enum(["eq", "neq", "contains", "gt", "lt"]), value: z.unknown() })).default([]),
  sort: z.array(z.object({ property: PropName, dir: z.enum(["asc", "desc"]) })).default([]),
  limit: z.number().int().positive().optional(),
});

/**
 * A node references a catalog component by name. The catalog package owns the
 * props schema per component; the spec package only knows a node is
 * { component, props, children, bindings }. Validation of props against the
 * catalog happens in the runtime with the catalog in hand.
 */
export const UiNode: z.ZodType<{
  id: string; component: string; props: Record<string, unknown>;
  bind?: { view?: string; action?: string }; children?: unknown[];
}> = z.lazy(() =>
  z.object({
    id: Id,
    component: z.string().min(1),
    props: z.record(z.unknown()).default({}),
    bind: z.object({ view: Id.optional(), action: PropName.optional() }).optional(),
    children: z.array(UiNode).optional(),
  }),
);

export const UiSpec = z.object({
  version: SemVerish,
  views: z.record(Id, ViewQuery),
  root: UiNode,
});
export type UiSpec = z.infer<typeof UiSpec>;
