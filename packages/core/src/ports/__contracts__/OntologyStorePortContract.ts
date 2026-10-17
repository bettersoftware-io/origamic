import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { ChangeSet, type Ontology } from "@origamic/spec";

import type { OntologyStorePort } from "../ontologyStorePort.ts";
import { collect } from "./emissions.ts";
import { createBookOntology, createDateFinishedChange } from "./fixtures.ts";

/**
 * The behaviour every OntologyStorePort adapter owes its callers. Each
 * adapter's test calls this with a function that makes a fresh store for one
 * owner: with no ontology, or holding `initial`.
 */
export function describeOntologyStorePortContract(
  label: string,
  createStore: (initial?: Ontology) => Promise<OntologyStorePort>,
): void {
  describe(`${label} :: OntologyStorePort contract`, () => {
    it("an owner with no ontology starts at version 0, with nothing in it", async () => {
      const store = await createStore();

      expect(await firstValueFrom(store.current())).toEqual({
        format: 1,
        version: 0,
        objectTypes: [],
        linkTypes: [],
        actionTypes: [],
      });
    });

    it("applying the book change yields the book tracker's ontology at version 1", async () => {
      const store = await createStore();

      const applied = await store.apply(createBookChange());

      expect(applied).toEqual({
        kind: "applied",
        ontology: createBookOntology(),
      });
      expect(await firstValueFrom(store.current())).toEqual(
        createBookOntology(),
      );
    });

    it("a second change on the same base is stale, and changes nothing", async () => {
      const store = await createStore(createBookOntology());
      const change = createDateFinishedChange();

      const first = await store.apply(change);
      const second = await store.apply(change);

      expect(first).toMatchObject({
        kind: "applied",
        ontology: { version: 2 },
      });
      expect(second).toEqual({ kind: "stale", current: 2 });
      expect(await firstValueFrom(store.current())).toEqual(
        first.kind === "applied" ? first.ontology : undefined,
      );
    });

    it("current() emits the applied ontology", async () => {
      const store = await createStore(createBookOntology());
      const seen = collect(store.current());

      await seen.next();
      await store.apply(createDateFinishedChange());
      await seen.next();
      seen.stop();

      expect(
        seen.emissions.map((ontology) => {
          return ontology.version;
        }),
      ).toEqual([1, 2]);
      expect(seen.emissions[1]?.objectTypes[0]).toMatchObject({
        name: "Book",
        version: 2,
      });
    });

    it("an invalid change is refused, and the ontology stays as it was", async () => {
      const store = await createStore(createBookOntology());

      const result = await store.apply(
        ChangeSet.parse({
          format: 1,
          baseVersion: 1,
          operations: [
            {
              op: "addProperty",
              type: "Film",
              property: { name: "director", type: "string" },
            },
          ],
        }),
      );

      expect(result).toMatchObject({
        kind: "invalid",
        problems: [{ path: "operations.0" }],
      });
      expect(await firstValueFrom(store.current())).toEqual(
        createBookOntology(),
      );
    });
  });
}

/** Slice step 2: the change set that makes the book tracker's ontology from an empty one. */
function createBookChange(): ChangeSet {
  const ontology = createBookOntology();

  return ChangeSet.parse({
    format: 1,
    baseVersion: 0,
    operations: [
      ...ontology.objectTypes.map(({ version: _version, ...objectType }) => {
        return { op: "addObjectType", objectType };
      }),
      ...ontology.actionTypes.map(({ version: _version, ...actionType }) => {
        return { op: "addActionType", actionType };
      }),
    ],
  });
}
