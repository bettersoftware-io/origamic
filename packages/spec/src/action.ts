import { z } from "zod";

import { Name, PropName, Version } from "./common.ts";

/** What an action requires beyond what the ontology says of its properties (ADR-0008). Extend this before reaching for code (ADR-0007). */
const Rule = z.discriminatedUnion("kind", [
  /** A property that is optional on the type, and that this action requires. */
  z.strictObject({ kind: z.literal("required"), property: PropName }),
  /** Bounds on a number. */
  z.strictObject({
    kind: z.literal("range"),
    property: PropName,
    min: z.number().optional(),
    max: z.number().optional(),
  }),
]);

const ActionShared = z.strictObject({
  name: PropName,
  description: z.string().optional(),
  rules: z.array(Rule).default([]),
});

/** `fields` are the properties of `type` its input sets; their types come from the ontology. */
const CreateAction = ActionShared.extend({
  kind: z.literal("create"),
  type: Name,
  fields: z.array(PropName).min(1),
});

/** As `create`, and it also takes the id of the object it changes. */
const UpdateAction = ActionShared.extend({
  kind: z.literal("update"),
  type: Name,
  fields: z.array(PropName).min(1),
});

/** Takes the id of the object it deletes, and nothing else. */
const DeleteAction = ActionShared.extend({
  kind: z.literal("delete"),
  type: Name,
});

/** Takes the object it links from as its target, and the id of the object it links to as `to`. */
const LinkAction = ActionShared.extend({
  kind: z.literal("link"),
  linkType: Name,
});

/** An action as a change set adds or replaces it: the ontology gives it its version. */
export const ActionTypeDraft = z.discriminatedUnion("kind", [
  CreateAction,
  UpdateAction,
  DeleteAction,
  LinkAction,
]);

/**
 * Every write is a named action, defined once in the ontology (ADR-0008).
 * Inside one ontology version an action names its type by name; an app
 * binds it as `name@version`.
 */
export const ActionType = z.discriminatedUnion("kind", [
  CreateAction.extend({ version: Version }),
  UpdateAction.extend({ version: Version }),
  DeleteAction.extend({ version: Version }),
  LinkAction.extend({ version: Version }),
]);
export type ActionType = z.infer<typeof ActionType>;
