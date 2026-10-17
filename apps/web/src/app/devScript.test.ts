import { describe, expect, it } from "vitest";

import { catalog } from "@origamic/runtime";
import {
  type Applied,
  applyChangeSet,
  type GenerationEvent,
  Ontology,
  type Proposal,
  validateApp,
} from "@origamic/spec";

import { createDevScript } from "./devScript.ts";

describe("the dev script", () => {
  it("replies with the book tracker first, then its date finished, each with its progress", () => {
    expect(
      createDevScript().map((reply) => {
        return reply.map((event) => {
          return event.kind;
        });
      }),
    ).toEqual([
      ["progress", "progress", "proposal"],
      ["progress", "progress", "proposal"],
    ]);
  });

  it("proposes change sets that apply one after the other, and apps that check against what each yields", () => {
    let ontology = Ontology.parse(EMPTY_ONTOLOGY);
    const checked: string[] = [];

    for (const proposal of createDevScript().map(proposalOf)) {
      const applied: Applied =
        proposal.changeSet === null
          ? { kind: "applied", ontology }
          : applyChangeSet(ontology, proposal.changeSet);

      if (applied.kind !== "applied") {
        throw new Error(`the change set did not apply: ${applied.kind}`);
      }

      ontology = applied.ontology;

      const validated = validateApp(proposal.app, ontology, catalog);

      expect(validated).toMatchObject({ kind: "valid" });
      checked.push(
        `${proposal.app.id} on v${String(proposal.app.ontologyVersion)}`,
      );
    }

    expect(checked).toEqual(["books on v1", "books on v2"]);
    expect(
      ontology.actionTypes.map(({ name, rules }) => {
        return { name, rules };
      }),
    ).toEqual([
      { name: "createBook", rules: [RATING] },
      { name: "updateBook", rules: [RATING] },
    ]);
  });
});

/** The rule both actions keep through the revision: a rating from 1 to 5. */
const RATING = { kind: "range", property: "rating", min: 1, max: 5 };

const EMPTY_ONTOLOGY = { format: 1, version: 0, objectTypes: [] };

function proposalOf(reply: GenerationEvent[]): Proposal {
  const last = reply.at(-1);

  if (last?.kind !== "proposal") {
    throw new Error("the reply ends without a proposal");
  }

  return last.proposal;
}
