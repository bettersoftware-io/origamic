import Anthropic from "@anthropic-ai/sdk";

import { type Failure, failureOf, replyOfMessage } from "./anthropicReply.ts";
import { anthropicSchemaOf } from "./anthropicSchema.ts";
import type { ModelClient, ModelReply, ModelRequest } from "./model.ts";

/** How hard the model works on a reply: Anthropic's `output_config.effort`. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  effort: Effort;
  /**
   * The SDK's `timeout`: how long each attempt may wait for the response's
   * headers, retries each getting their own. It does not bound the stream
   * once it flows, nor an attempt and its retries together; `generate`'s
   * deadline is the bound on the whole generation.
   */
  timeoutMs: number;
}

/** How many times the SDK asks again after a connection error, a 429 or a 5xx. */
const MAX_RETRIES = 2;

/**
 * The gateway's one call to a model (ADR-0011, decision 10 of the first
 * slice's plan): structured outputs held to the catalog's schema, adaptive
 * thinking, streamed, with Anthropic's server-side fallback when the model
 * declines. The call is aborted with `signal` (the caller left, or the
 * generation's deadline passed); `timeoutMs` bounds each attempt's wait for
 * headers only. What comes back is read by `replyOfMessage`, and what goes
 * wrong by `failureOf`, which also gives the line logged here: both are pure,
 * and tested. This file is the SDK call alone.
 *
 * No test in the gate calls it; the tests use `testing/scriptedModel.ts`.
 */
export function createAnthropicModel(config: AnthropicConfig): ModelClient {
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: MAX_RETRIES,
    timeout: config.timeoutMs,
  });

  return {
    complete: async (
      request: ModelRequest,
      signal: AbortSignal,
    ): Promise<ModelReply> => {
      try {
        const message = await client.beta.messages
          .stream(
            {
              model: config.model,
              max_tokens: 64000,
              system: request.system,
              messages: request.messages.map(({ role, content }) => {
                return { role, content };
              }),
              thinking: { type: "adaptive" },
              output_config: {
                effort: config.effort,
                format: {
                  type: "json_schema",
                  schema: anthropicSchemaOf(request.schema),
                },
              },
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            },
            { signal, timeout: config.timeoutMs },
          )
          .finalMessage();

        return replyOfMessage(message);
      } catch (error) {
        const failure = failureOf(error);

        log(failure);

        return failure.reply;
      }
    },
  };
}

/** How long the check at start may wait for the API, with one retry. */
const CHECK_TIMEOUT_MS = 15_000;

/**
 * Asks the API whether the key works and the model exists, so a wrong one is
 * found at the gateway's start, not at the builder's first request. It gives
 * what went wrong, if anything; `verdictOfModelCheck` says what follows.
 */
export async function checkAnthropicModel(
  config: AnthropicConfig,
): Promise<Failure | undefined> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: 1,
    timeout: CHECK_TIMEOUT_MS,
  });

  try {
    await client.models.retrieve(config.model);

    return undefined;
  } catch (error) {
    return failureOf(error);
  }
}

/** A caller who left is routine; anything else is an error. */
function log({ level, log: line }: Failure): void {
  if (level === "info") {
    console.info(line);
  } else {
    console.error(line);
  }
}
