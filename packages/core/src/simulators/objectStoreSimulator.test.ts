import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type JsonValue, Ontology } from "@origamic/spec";
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

  it("sorts arrays and objects as Postgres orders jsonb: by size, then by content", async () => {
    // Each pair is listed out of order, so a sort that left it would fail.
    const ratings: JsonValue[] = [
      { stars: 5, of: 5 },
      { stars: 5 },
      { stars: 4 },
      { abc: 4 },
      { zz: 4 },
      [1, 3],
      [1, 2],
      [9],
      true,
      false,
    ];

    const store = createObjectStoreSimulator(
      createOntologyStoreSimulator(Ontology.parse(createBookOntology())),
      ratings.map((rating, index) => {
        return {
          id: `book-${index}`,
          type: "Book",
          typeVersion: 1,
          values: { title: `Book ${index}`, status: "want", rating },
        };
      }),
    );

    const sorted = await firstValueFrom(
      store.view({
        type: "Book",
        filter: [],
        sort: [{ property: "rating", dir: "asc" }],
      }),
    );

    expect(
      sorted.map((object) => {
        return object.values.rating;
      }),
    ).toEqual([
      false,
      true,
      [9],
      [1, 2],
      [1, 3],
      { zz: 4 },
      { abc: 4 },
      { stars: 4 },
      { stars: 5 },
      { of: 5, stars: 5 },
    ]);
  });
});
