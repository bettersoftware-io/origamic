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

/**
 * What came back: the reply as JSON, read no further; a refusal, with its
 * category when the provider names one; a reply that stopped before it was
 * whole; a provider that could not answer now (unreachable, rate-limited,
 * overloaded: worth asking again); or a provider that refused the request
 * itself (a bad key, an unknown model, a schema it does not take: asking
 * again changes nothing).
 */
export type ModelReply =
  | { kind: "json"; value: unknown }
  | { kind: "refused"; category: string | null }
  | { kind: "cut"; reason: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "rejected"; reason: string };

export interface ModelClient {
  /** One reply to `request`. `signal` aborts it when the caller has gone or the generation's deadline has passed. */
  complete(request: ModelRequest, signal: AbortSignal): Promise<ModelReply>;
}
