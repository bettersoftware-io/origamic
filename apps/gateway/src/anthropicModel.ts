import Anthropic from "@anthropic-ai/sdk";

import { anthropicSchemaOf } from "./anthropicSchema.ts";
import type { ModelClient, ModelReply, ModelRequest } from "./model.ts";

/** How hard the model works on a reply: Anthropic's `output_config.effort`. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  effort: Effort;
}

/**
 * The gateway's one call to a model (ADR-0011, decision 10 of the first
 * slice's plan): structured outputs held to the catalog's schema, adaptive
 * thinking, streamed, with Anthropic's server-side fallback when the model
 * declines. The stop reason is read before the content: a refusal or a reply
 * cut short is said as such, never parsed.
 *
 * No test in the gate calls it; the tests use `testing/scriptedModel.ts`.
 */
export function createAnthropicModel(config: AnthropicConfig): ModelClient {
  const client = new Anthropic({ apiKey: config.apiKey });

  return {
    complete: async (request: ModelRequest): Promise<ModelReply> => {
      const message = await client.beta.messages
        .stream({
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
        })
        .finalMessage();

      if (message.stop_reason === "refusal") {
        return {
          kind: "refused",
          category: message.stop_details?.category ?? null,
        };
      }

      if (message.stop_reason !== "end_turn") {
        return { kind: "cut", reason: message.stop_reason ?? "no stop reason" };
      }

      const text = message.content
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
    },
  };
}
