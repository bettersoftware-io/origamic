import { z } from "zod";

import { App, AppDraft } from "./binding.ts";
import { Format } from "./common.ts";
import { ChangeSet, Ontology } from "./ontology.ts";

// What travels between the client and the gateway. Each side parses what it
// receives with these, so a value from the other side is never used unread.

/** A problem as `checkApp` and `validateApp` word it. */
const Problem = z.strictObject({ path: z.string(), message: z.string() });

/** What the builder asks for, with the ontology it is asked against and, for a revision, the app it revises. */
export const GenerationRequest = z.strictObject({
  format: Format,
  intent: z.string().min(1).max(4000),
  ontology: Ontology,
  app: App.optional(),
});
export type GenerationRequest = z.infer<typeof GenerationRequest>;

/** What the model proposes: a change set to the ontology, or none, and the app that needs it. Nothing is stored until the builder accepts it. */
export const Proposal = z.strictObject({
  explanation: z.string(),
  changeSet: ChangeSet.nullable(),
  app: AppDraft,
});
export type Proposal = z.infer<typeof Proposal>;

/** One event of a generation: its progress, then one proposal, or a failure with the problems the model's last reply had. */
export const GenerationEvent = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("progress"), message: z.string() }),
  z.strictObject({ kind: z.literal("proposal"), proposal: Proposal }),
  z.strictObject({
    kind: z.literal("failed"),
    message: z.string(),
    problems: z.array(Problem),
  }),
]);
export type GenerationEvent = z.infer<typeof GenerationEvent>;
