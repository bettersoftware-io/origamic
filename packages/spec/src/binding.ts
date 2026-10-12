import { z } from "zod";
import { Id, SemVerish, TypeRef } from "./common";
import { ActionType } from "./action";
import { UiSpec } from "./ui-spec";

/** An app is a bundle of specs plus the ontology version it was built against. */
export const AppSpec = z.object({
  id: Id,
  version: SemVerish,
  name: z.string().min(1),
  ontologyVersion: SemVerish,
  /** Every object type the app touches, by versioned ref. Must be closed over views and actions. */
  binds: z.array(TypeRef).min(1),
  actions: z.array(ActionType),
  ui: UiSpec,
});
export type AppSpec = z.infer<typeof AppSpec>;
