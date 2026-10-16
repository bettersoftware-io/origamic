import { lastValueFrom, toArray } from "rxjs";
import { describe, expect, it } from "vitest";

import { type GenerationRequest, Ontology } from "@origamic/spec";
import { createBookOntology } from "@origamic/spec/testing/bookTracker.ts";

import { describeLlmGatewayPortContract } from "#/ports/__contracts__/LlmGatewayPortContract.ts";

import { createLlmGatewaySimulator } from "./llmGatewaySimulator.ts";

describeLlmGatewayPortContract("the LLM gateway simulator", (reply) => {
  return Promise.resolve(createLlmGatewaySimulator([reply]));
});

describe("the LLM gateway simulator", () => {
  it("replays its scripted replies one generation after another", async () => {
    const gateway = createLlmGatewaySimulator([
      [{ kind: "failed", message: "first", problems: [] }],
      [{ kind: "failed", message: "second", problems: [] }],
    ]);

    const first = await lastValueFrom(gateway.generate(createRequest()));
    const second = await lastValueFrom(gateway.generate(createRequest()));

    expect([first, second]).toMatchObject([
      { message: "first" },
      { message: "second" },
    ]);
  });

  it("fails a generation once its replies run out", async () => {
    const gateway = createLlmGatewaySimulator([]);

    const events = await lastValueFrom(
      gateway.generate(createRequest()).pipe(toArray()),
    );

    expect(events).toEqual([
      {
        kind: "failed",
        message: "The simulator has no scripted reply left for this request.",
        problems: [],
      },
    ]);
  });

  it("ends a reply at its first proposal or failure, and fails one that has neither", async () => {
    const gateway = createLlmGatewaySimulator([
      [
        { kind: "failed", message: "the end", problems: [] },
        { kind: "progress", message: "after the end" },
      ],
      [{ kind: "progress", message: "thinking" }],
    ]);

    const ended = await lastValueFrom(
      gateway.generate(createRequest()).pipe(toArray()),
    );

    const unfinished = await lastValueFrom(
      gateway.generate(createRequest()).pipe(toArray()),
    );

    expect(ended).toEqual([
      { kind: "failed", message: "the end", problems: [] },
    ]);
    expect(unfinished).toEqual([
      { kind: "progress", message: "thinking" },
      {
        kind: "failed",
        message: "The scripted reply ended without a proposal.",
        problems: [],
      },
    ]);
  });

  it("emits nothing while the caller is still subscribing", () => {
    const gateway = createLlmGatewaySimulator([
      [{ kind: "failed", message: "later", problems: [] }],
    ]);
    const seen: unknown[] = [];

    gateway.generate(createRequest()).subscribe((event) => {
      seen.push(event);
    });

    expect(seen).toEqual([]);
  });
});

function createRequest(): GenerationRequest {
  return {
    format: 1,
    intent: "a book tracker",
    ontology: Ontology.parse(createBookOntology()),
  };
}
