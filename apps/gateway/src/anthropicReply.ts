import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";

import type { ModelReply } from "./model.ts";

/** What of Anthropic's message the gateway reads. */
export type AnthropicMessage = Pick<
  BetaMessage,
  "stop_reason" | "stop_details" | "content"
>;

/** What went wrong, as a reply for the caller and a line for the gateway's log: `info` for what is routine (a caller who left), `error` for the rest. */
export interface Failure {
  reply: FailedReply;
  log: string;
  level: "info" | "error";
}

/** A reply that says the provider gave none. */
interface FailedReply {
  kind: "unavailable" | "rejected";
  reason: string;
}

/** What the gateway does after asking the API for its model at start. */
export type ModelCheckVerdict =
  | { kind: "start" }
  | { kind: "warn"; message: string }
  | { kind: "stop"; message: string };

/** The error types an error event in the middle of a stream carries that are worth asking again. */
const PASSING = new Set([
  "rate_limit_error",
  "timeout_error",
  "overloaded_error",
  "api_error",
]);

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
 * The reply an error makes, and what the gateway logs of it: the error's
 * type, the request id and the API's message, never the key. A request the
 * API refuses (400, 401, 403, 404, 422: a schema it does not take, a bad key,
 * an unknown model) is `rejected`; a connection that fails, a 408, a 409, a
 * 429 and a 5xx, the ones the SDK itself asks again on, are `unavailable`.
 * An error event in the middle of a stream has no status, and is read by its
 * type.
 */
export function failureOf(error: unknown): Failure {
  if (error instanceof Anthropic.APIUserAbortError) {
    return {
      reply: { kind: "unavailable", reason: "aborted" },
      log: "anthropic: the call was aborted (its caller left, or its deadline passed)",
      level: "info",
    };
  }

  if (error instanceof Anthropic.APIConnectionError) {
    return failure(
      "unavailable",
      "no connection",
      `no connection: ${error.message}`,
    );
  }

  if (error instanceof Anthropic.APIError) {
    const type = error.type ?? "error";
    const log = `${type}, request ${error.requestID ?? "unknown"}: ${error.message}`;

    if (error.status === undefined) {
      const passing = error.type === null || PASSING.has(error.type);

      return failure(passing ? "unavailable" : "rejected", type, log);
    }

    const passing =
      [408, 409, 429].includes(error.status) || error.status >= 500;

    return failure(
      passing ? "unavailable" : "rejected",
      `${error.status} ${type}`,
      log,
    );
  }

  return failure("unavailable", "an unexpected error", String(error));
}

/** Whether the gateway starts after asking for its model: not on a key or a model the API refuses; with a warning when the API could not answer. */
export function verdictOfModelCheck(
  model: string,
  failed: Failure | undefined,
): ModelCheckVerdict {
  if (failed === undefined) {
    return { kind: "start" };
  }

  const { reply } = failed;

  if (reply.kind === "rejected") {
    return {
      kind: "stop",
      message: `the model "${model}" was refused (${reply.reason}): check GATEWAY_MODEL and ANTHROPIC_API_KEY (${failed.log})`,
    };
  }

  return {
    kind: "warn",
    message: `the model "${model}" could not be confirmed (${reply.reason}); starting anyway`,
  };
}

function failure(
  kind: "unavailable" | "rejected",
  reason: string,
  log: string,
): Failure {
  return { reply: { kind, reason }, log: `anthropic: ${log}`, level: "error" };
}
