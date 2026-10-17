import { describe, expect, it } from "vitest";

import { Ontology } from "@origamic/spec";
import { createBookOntology } from "@origamic/spec/testing/bookTracker.ts";

import { describeObjectStorePortContract } from "#/ports/__contracts__/ObjectStorePortContract.ts";

import { createObjectStoreSimulator } from "./objectStoreSimulator.ts";
import { createOntologyStoreSimulator } from "./ontologyStoreSimulator.ts";

describeObjectStorePortContract("the object store simulator", (initial) => {
  return Promise.resolve(
    createObjectStoreSimulator(
      createOntologyStoreSimulator(initial.ontology),
      initial.objects,
    ),
  );
});

describe("the object store simulator", () => {
  it("gives a new object an id no object it holds has", async () => {
    const ontology = Ontology.parse(createBookOntology());
    const store = createObjectStoreSimulator(
      createOntologyStoreSimulator(ontology),
      [
        {
          id: "object-1",
          type: "Book",
          typeVersion: 1,
          values: { title: "Dune", status: "want" },
        },
      ],
    );

    const result = await store.execute({
      action: "createBook",
      version: 1,
      input: { title: "Emma" },
    });

    expect(result).toEqual({ kind: "done", id: "object-2" });
  });
});
