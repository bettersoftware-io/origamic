import { asapScheduler, type Observable, scheduled } from "rxjs";

import type { GenerationEvent, GenerationRequest } from "@origamic/spec";

import type { LlmGatewayPort } from "#/ports/llmGatewayPort.ts";

/**
 * The LlmGatewayPort with no model: each generation replays the next of
 * `replies`, the events a gateway would send for it (ADR-0012). The events
 * arrive after the caller has subscribed, as they would over a network.
 *
 * A reply ends at its first `proposal` or `failed`, as every gateway's does.
 * One that has neither ends with a `failed`, and so does a generation asked
 * for when no reply is left.
 */
export function createLlmGatewaySimulator(
  replies: readonly (readonly GenerationEvent[])[],
): LlmGatewayPort {
  const waiting = [...replies];

  return {
    generate: (_request: GenerationRequest): Observable<GenerationEvent> => {
      return scheduled(finished(waiting.shift()), asapScheduler);
    },
  };
}

/** The events up to the first that ends a generation, with a failure added when none does. */
function finished(
  reply: readonly GenerationEvent[] | undefined,
): GenerationEvent[] {
  if (reply === undefined) {
    return [
      failed("The simulator has no scripted reply left for this request."),
    ];
  }

  const end = reply.findIndex((event) => {
    return event.kind !== "progress";
  });

  return end === -1
    ? [...reply, failed("The scripted reply ended without a proposal.")]
    : reply.slice(0, end + 1);
}

function failed(message: string): GenerationEvent {
  return { kind: "failed", message, problems: [] };
}
