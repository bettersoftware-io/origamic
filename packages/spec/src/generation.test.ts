import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { GenerationEvent, GenerationRequest, Proposal } from "./generation.ts";
import {
  createBookApp,
  createBookOntology,
  createDateFinishedChange,
} from "./testing/bookTracker.ts";
import { issuesOf } from "./testing/issues.ts";

describe("the generation wire", () => {
  it("takes a request with an intent of up to 4000 characters, and an app to revise if there is one", () => {
    const revising = {
      ...createRequest(),
      app: { ...createBookApp(), version: 1 },
    };

    expect(issuesOf(GenerationRequest, createRequest())).toEqual([]);
    expect(issuesOf(GenerationRequest, revising)).toEqual([]);
    expect(
      issuesOf(GenerationRequest, createRequest("x".repeat(4000))),
    ).toEqual([]);
  });

  it("rejects a request without an intent, or with an intent of 4001 characters", () => {
    const { intent: _intent, ...unasked } = createRequest();

    expect(issuesOf(GenerationRequest, unasked)).not.toEqual([]);
    expect(issuesOf(GenerationRequest, createRequest(""))).not.toEqual([]);
    expect(
      issuesOf(GenerationRequest, createRequest("x".repeat(4001))),
    ).not.toEqual([]);
  });

  it("rejects a proposal whose app fails AppDraft", () => {
    const proposal = createProposal();

    proposal.app.ui.root = "home";

    expect(issuesOf(Proposal, proposal)).toEqual([
      'the root "home" is not an element',
    ]);
  });

  it.each(createEvents())(
    "carries a $kind event through JSON unchanged",
    (event) => {
      const parsed = GenerationEvent.parse(event);
      const received: unknown = JSON.parse(JSON.stringify(parsed));

      expect(GenerationEvent.parse(received)).toEqual(parsed);
    },
  );
});

type RequestInput = z.input<typeof GenerationRequest>;
type ProposalInput = z.input<typeof Proposal>;
type EventInput = z.input<typeof GenerationEvent>;

function createRequest(
  intent = "a tracker for the books I'm reading",
): RequestInput {
  return { format: 1, intent, ontology: createBookOntology() };
}

function createProposal(): ProposalInput {
  return {
    explanation: "Adds a date to each book.",
    changeSet: createDateFinishedChange(),
    app: createBookApp(),
  };
}

function createEvents(): EventInput[] {
  return [
    { kind: "progress", message: "Reading the ontology" },
    { kind: "proposal", proposal: createProposal() },
    {
      kind: "failed",
      message: "The model's app named what does not exist, twice.",
      problems: [
        {
          path: "ui.elements.table.props.colour",
          message:
            'a "Table" has no prop "colour"; it takes rows, columns, selected',
        },
      ],
    },
  ];
}
