import { afterAll, describe, expect, it } from "vitest";

import {
  createBookOntology,
  createDateFinishedChange,
} from "@origamic/core/ports/__contracts__/fixtures.ts";
import { describeOntologyStorePortContract } from "@origamic/core/ports/__contracts__/OntologyStorePortContract.ts";

import { createOwners } from "#/testing/owners.ts";

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
