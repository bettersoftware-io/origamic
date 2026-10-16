import type { JsonSchema } from "@origamic/catalog/manifest";

// The gateway's own port to a model (ADR-0011): what it asks, and what can
// come back. `anthropicModel.ts` is the one implementation that calls a
// model; the tests use `testing/scriptedModel.ts`.

/** One turn of what the model is asked. */
export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

/** What the model is asked: its instructions, the conversation so far, and the JSON Schema its reply is held to. */
export interface ModelRequest {
  system: string;
  messages: readonly ModelMessage[];
  schema: JsonSchema;
}

/** What came back: the reply as JSON, read no further; a refusal, with its category when the provider names one; or a reply that stopped before it was whole. */
export type ModelReply =
  | { kind: "json"; value: unknown }
  | { kind: "refused"; category: string | null }
  | { kind: "cut"; reason: string };

export interface ModelClient {
  /** One reply to `request`. It rejects only when the model cannot be reached. */
  complete(request: ModelRequest): Promise<ModelReply>;
}
