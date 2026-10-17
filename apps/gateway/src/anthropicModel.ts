import Anthropic from "@anthropic-ai/sdk";

import { failureOf, replyOfMessage } from "./anthropicReply.ts";
import { anthropicSchemaOf } from "./anthropicSchema.ts";
import type { ModelClient, ModelReply, ModelRequest } from "./model.ts";

/** How hard the model works on a reply: Anthropic's `output_config.effort`. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  effort: Effort;
  /** How long one call may take, retries included. */
  timeoutMs: number;
}

/** How many times the SDK asks again after a connection error, a 429 or a 5xx. */
const MAX_RETRIES = 2;

/**
 * The gateway's one call to a model (ADR-0011, decision 10 of the first
 * slice's plan): structured outputs held to the catalog's schema, adaptive
 * thinking, streamed, with Anthropic's server-side fallback when the model
 * declines. The call is aborted with `signal`, and given up after
 * `timeoutMs`. What comes back is read by `replyOfMessage`, and what goes
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

        console.error(failure.log);

        return failure.reply;
      }
    },
  };
}

/** Asks the API whether the key works and the model exists, so a wrong one stops the gateway at its start, not at the builder's first request. */
export async function checkAnthropicModel(
  config: AnthropicConfig,
): Promise<void> {
  const client = new Anthropic({
    apiKey: config.apiKey,
    maxRetries: MAX_RETRIES,
  });

  try {
    await client.models.retrieve(config.model);
  } catch (error) {
    throw new Error(
      `the model "${config.model}" could not be confirmed with the API key given (${failureOf(error).log})`,
    );
  }
}
