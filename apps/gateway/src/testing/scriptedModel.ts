import type { ModelClient, ModelReply, ModelRequest } from "../model.ts";

/** A model that gives its scripted replies in order, and keeps what it was asked. */
export interface ScriptedModel extends ModelClient {
  /** Every request so far, in order. */
  readonly requests: readonly ModelRequest[];
  /** The signal each request was given, in order. */
  readonly signals: readonly AbortSignal[];
}

/**
 * The model of every test (ADR-0011): no test in the gate calls a real one.
 * Each request takes the next of `replies`; once they run out, it rejects,
 * as a model that cannot be reached does.
 */
export function createScriptedModel(
  replies: readonly ModelReply[],
): ScriptedModel {
  const waiting = [...replies];
  const requests: ModelRequest[] = [];
  const signals: AbortSignal[] = [];

  return {
    requests,
    signals,
    complete: (
      request: ModelRequest,
      signal: AbortSignal,
    ): Promise<ModelReply> => {
      requests.push(request);
      signals.push(signal);

      const reply = waiting.shift();

      return reply === undefined
        ? Promise.reject(new Error("the scripted model has no reply left"))
        : Promise.resolve(reply);
    },
  };
}
