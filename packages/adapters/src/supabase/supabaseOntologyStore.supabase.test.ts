import { firstValueFrom } from "rxjs";
import { afterAll, describe, expect, it } from "vitest";

import {
  createBookOntology,
  createDateFinishedChange,
} from "@origamic/core/ports/__contracts__/fixtures.ts";
import { describeOntologyStorePortContract } from "@origamic/core/ports/__contracts__/OntologyStorePortContract.ts";
import { ChangeSet, Ontology } from "@origamic/spec";

import { createOwners } from "#/testing/owners.ts";

import { createSupabaseOntologyStore } from "./supabaseOntologyStore.ts";

const owners = createOwners();

afterAll(async () => {
  await owners.remove();
});

describeOntologyStorePortContract("Supabase", async (initial) => {
  const owner = await owners.create();

  if (initial !== undefined) {
    await owners.writeOntology(owner, initial);
  }

  return owner.adapters.ontology;
});

describe("a change whose base was read before another was stored", () => {
  it("is stale at the stored version, and stores nothing", async () => {
    const owner = await owners.create();

    await owners.writeOntology(owner, createBookOntology());

    // The read a loser of the race made: the ontology as it stood at version 0.
    const store = createSupabaseOntologyStore(
      await owners.createClientOf(owner),
      {
        readBase: () => {
          return Promise.resolve(
            Ontology.parse({ format: 1, version: 0, objectTypes: [] }),
          );
        },
      },
    );

    expect(await store.apply(createFirstChange())).toEqual({
      kind: "stale",
      current: 1,
    });
    expect(await firstValueFrom(owner.adapters.ontology.current())).toEqual(
      Ontology.parse(createBookOntology()),
    );
  });
});

describe("two changes on one base, applied at once", () => {
  it("stores one and calls the other stale, on stores of their own", async () => {
    const owner = await owners.create();
    const other = owners.createSignedOut();

    await owners.writeOntology(owner, createBookOntology());
    await other.session.signIn(owner.email, owner.password);

    const results = await Promise.all([
      owner.adapters.ontology.apply(createDateFinishedChange()),
      other.ontology.apply(createDateFinishedChange()),
    ]);

    expect(
      results
        .map((result) => {
          return result.kind;
        })
        .sort(),
    ).toEqual(["applied", "stale"]);
    expect(results).toContainEqual({ kind: "stale", current: 2 });
  });
});

function createFirstChange(): ChangeSet {
  return ChangeSet.parse({
    format: 1,
    baseVersion: 0,
    operations: [
      {
        op: "addObjectType",
        objectType: {
          name: "Shelf",
          titleProperty: "name",
          properties: [{ name: "name", type: "string", required: true }],
        },
      },
    ],
  });
}
