import { lastValueFrom, toArray } from "rxjs";
import { describe, expect, it } from "vitest";

import type { GenerationEvent, GenerationRequest } from "@origamic/spec";

import type { LlmGatewayPort } from "../llmGatewayPort.ts";
import { createAppDraft, createBookOntology } from "./fixtures.ts";

/**
 * The behaviour every LlmGatewayPort adapter owes its callers. Each
 * adapter's test calls this with a function that makes a gateway whose model
 * replies with `reply`, the events of one generation as the gateway would
 * send them.
 */
export function describeLlmGatewayPortContract(
  label: string,
  createGateway: (reply: readonly GenerationEvent[]) => Promise<LlmGatewayPort>,
): void {
  describe(`${label} :: LlmGatewayPort contract`, () => {
    it("events arrive in order and the stream completes after a proposal or a failed", async () => {
      const proposing: GenerationEvent[] = [
        { kind: "progress", message: "Reading the ontology" },
        { kind: "progress", message: "Writing the app" },
        {
          kind: "proposal",
          proposal: {
            explanation: "A table of books, a filter and two forms.",
            changeSet: null,
            app: createAppDraft("books", "Books I'm reading"),
          },
        },
      ];

      const failing: GenerationEvent[] = [
        { kind: "progress", message: "Writing the app" },
        {
          kind: "failed",
          message: "The model's app names what the catalog does not have.",
          problems: [
            { path: "ui.elements.table.component", message: "not in it" },
          ],
        },
      ];

      const proposed = await lastValueFrom(
        (await createGateway(proposing))
          .generate(createRequest())
          .pipe(toArray()),
      );

      const failed = await lastValueFrom(
        (await createGateway(failing))
          .generate(createRequest())
          .pipe(toArray()),
      );

      expect(proposed).toEqual(proposing);
      expect(failed).toEqual(failing);
    });
  });
}

function createRequest(): GenerationRequest {
  return {
    format: 1,
    intent: "a simple tracker for the books I'm reading",
    ontology: createBookOntology(),
  };
}
