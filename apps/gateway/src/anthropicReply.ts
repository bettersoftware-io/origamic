import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import type { ModelReply } from "./model.ts";

/** What of Anthropic's message the gateway reads. */
export type AnthropicMessage = Pick<
  BetaMessage,
  "stop_reason" | "stop_details" | "content"
>;

/** What went wrong, as a reply for the caller and a line for the gateway's log. */
export interface Failure {
  reply: ModelReply;
  log: string;
}

/**
 * The reply a finished message makes. The stop reason is read before the
 * content: a refusal or a reply cut short is said as such, never parsed.
 *
 * After a server-side fallback the content holds the declining model's
 * partial text, then a `fallback` block, then the fallback model's output;
 * only the text after the last `fallback` block is the reply.
 */
export function replyOfMessage(message: AnthropicMessage): ModelReply {
  if (message.stop_reason === "refusal") {
    return {
      kind: "refused",
      category: message.stop_details?.category ?? null,
    };
  }

  if (message.stop_reason !== "end_turn") {
    return { kind: "cut", reason: message.stop_reason ?? "no stop reason" };
  }

  const last = message.content.findLastIndex((block) => {
    return block.type === "fallback";
  });

  const text = message.content
    .slice(last + 1)
    .map((block) => {
      return block.type === "text" ? block.text : "";
    })
    .join("");

  try {
    const value: unknown = JSON.parse(text);

    return { kind: "json", value };
  } catch {
    return { kind: "cut", reason: "the reply is not JSON" };
  }
}

/**
 * The reply an error makes, and what the gateway logs of it: the status, the
 * error's type, the request id and the API's message, never the key. A
 * request the API refuses (400, 401, 403, 404: a schema it does not take, a
 * bad key, an unknown model) is `rejected`; a connection that fails, a 429
 * and a 5xx are `unavailable`, worth asking again.
 */
export function failureOf(error: unknown): Failure {
  if (error instanceof Anthropic.APIUserAbortError) {
    return {
      reply: { kind: "unavailable", reason: "aborted" },
      log: "anthropic: the call was aborted (its caller left, or its deadline passed)",
    };
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return {
      reply: { kind: "unavailable", reason: "no connection" },
      log: `anthropic: no connection: ${error.message}`,
    };
  }

  if (error instanceof Anthropic.APIError && error.status !== undefined) {
    const type = error.type ?? "error";
    const reason = `${error.status} ${type}`;
    const log = `anthropic: ${type}, request ${error.requestID ?? "unknown"}: ${error.message}`;
    const retryable = error.status === 429 || error.status >= 500;

    return {
      reply: { kind: retryable ? "unavailable" : "rejected", reason },
      log,
    };
  }

  return {
    reply: { kind: "unavailable", reason: "an unexpected error" },
    log: `anthropic: ${String(error)}`,
  };
}
