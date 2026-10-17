import Anthropic, { type APIError } from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import {
  type AnthropicMessage,
  failureOf,
  replyOfMessage,
} from "./anthropicReply.ts";

describe("reading Anthropic's message", () => {
  it("reads only the text after the last fallback block", () => {
    const reply = replyOfMessage(
      createMessage("end_turn", [
        text('{"explanation": "half of a'),
        fallback("claude-opus-5-5", "claude-opus-5"),
        text('{"explanation": "a third of'),
        fallback("claude-opus-5", "claude-opus-4-8"),
        text('{"explanation":'),
        text(' "whole"}'),
      ]),
    );

    expect(reply).toEqual({ kind: "json", value: { explanation: "whole" } });
  });

  it("reads every text block when no model fell back, and skips thinking", () => {
    const reply = replyOfMessage(
      createMessage("end_turn", [
        { type: "thinking", thinking: "", signature: "s" },
        text("[1,"),
        text("2]"),
      ]),
    );

    expect(reply).toEqual({ kind: "json", value: [1, 2] });
  });

  it("says a refusal with its category, before reading any content", () => {
    const message = createMessage("refusal", [text("{ not json")]);

    message.stop_details = {
      type: "refusal",
      category: "cyber",
      explanation: null,
      fallback_credit_token: null,
      fallback_has_prefill_claim: null,
      recommended_model: null,
    };

    expect(replyOfMessage(message)).toEqual({
      kind: "refused",
      category: "cyber",
    });
    expect(replyOfMessage(createMessage("refusal", []))).toEqual({
      kind: "refused",
      category: null,
    });
  });

  it("says a reply cut short by its stop reason, and one that is not JSON as cut too", () => {
    expect(replyOfMessage(createMessage("max_tokens", [text("{")]))).toEqual({
      kind: "cut",
      reason: "max_tokens",
    });
    expect(replyOfMessage(createMessage(null, []))).toEqual({
      kind: "cut",
      reason: "no stop reason",
    });
    expect(replyOfMessage(createMessage("end_turn", [text("{")]))).toEqual({
      kind: "cut",
      reason: "the reply is not JSON",
    });
  });
});

describe("reading what went wrong", () => {
  it.each([
    [400, "invalid_request_error"],
    [401, "authentication_error"],
    [404, "not_found_error"],
  ])(
    "a %i is a request the provider refused: asking again changes nothing",
    (status, type) => {
      const failure = failureOf(apiError(status, type));

      expect(failure.reply).toEqual({
        kind: "rejected",
        reason: `${status} ${type}`,
      });
    },
  );

  it.each([
    [429, "rate_limit_error"],
    [500, "api_error"],
    [529, "overloaded_error"],
  ])("a %i is a provider that cannot answer now", (status, type) => {
    expect(failureOf(apiError(status, type)).reply).toEqual({
      kind: "unavailable",
      reason: `${status} ${type}`,
    });
  });

  it("a connection that fails or times out is a provider that cannot answer now", () => {
    expect(
      failureOf(new Anthropic.APIConnectionError({ message: "refused" })).reply,
    ).toEqual({ kind: "unavailable", reason: "no connection" });
    expect(failureOf(new Anthropic.APIConnectionTimeoutError()).reply).toEqual({
      kind: "unavailable",
      reason: "no connection",
    });
  });

  it("a call aborted by the gateway says so, in the reply and the log", () => {
    const failure = failureOf(new Anthropic.APIUserAbortError());

    expect(failure).toEqual({
      reply: { kind: "unavailable", reason: "aborted" },
      log: "anthropic: the call was aborted (its caller left, or its deadline passed)",
    });
  });

  it("an error that is not the API's is a provider that cannot answer now", () => {
    expect(failureOf(new Error("socket hang up")).reply).toEqual({
      kind: "unavailable",
      reason: "an unexpected error",
    });
  });

  it("logs the status, the type, the request id and the message, and never the key", () => {
    const { log } = failureOf(apiError(401, "authentication_error"));

    expect(log).toMatch(
      /^anthropic: authentication_error, request req_1: 401 .*the authentication_error happened/,
    );
    expect(failureOf(new Error("socket hang up")).log).toBe(
      "anthropic: Error: socket hang up",
    );
  });
});

type Block = AnthropicMessage["content"][number];

function createMessage(
  stopReason: AnthropicMessage["stop_reason"],
  content: Block[],
): AnthropicMessage {
  return { stop_reason: stopReason, stop_details: null, content };
}

function text(value: string): Block {
  return { type: "text", text: value, citations: null };
}

function fallback(from: string, to: string): Block {
  return {
    type: "fallback",
    from: { model: from },
    to: { model: to },
    trigger: { type: "refusal", category: "cyber" },
  };
}

function apiError(status: number, type: string): APIError {
  return Anthropic.APIError.generate(
    status,
    { type: "error", error: { type, message: `the ${type} happened` } },
    undefined,
    new Headers({ "request-id": "req_1" }),
  );
}
