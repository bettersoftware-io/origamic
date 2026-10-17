import { BehaviorSubject, from, type Observable, switchMap } from "rxjs";

import type { OntologyStorePort } from "@origamic/core";
import {
  type Applied,
  applyChangeSet,
  type ChangeSet,
  Ontology,
} from "@origamic/spec";

import { type Client, dataOf } from "./rows.ts";

/**
 * The OntologyStorePort on the `ontology_versions` table: one row for each
 * version of the signed-in owner's ontology, with the change set that made
 * it. A change set is applied to the latest version, and stored as the next
 * one; the table's key (owner, version) refuses a second write of the same
 * version, so of two changes on one base, one is stored and one is stale.
 */
export function createSupabaseOntologyStore(
  client: Client,
  options: OntologyStoreOptions = {},
): OntologyStorePort {
  const readBase = options.readBase ?? readOntology;
  const changed = new BehaviorSubject<undefined>(undefined);

  return {
    current: (): Observable<Ontology> => {
      return changed.pipe(
        switchMap(() => {
          return from(readOntology(client));
        }),
      );
    },
    apply: async (change: ChangeSet): Promise<Applied> => {
      const applied = applyChangeSet(await readBase(client), change);

      if (applied.kind !== "applied") {
        return applied;
      }

      const inserted = await client.from("ontology_versions").insert({
        version: applied.ontology.version,
        ontology: applied.ontology,
        change,
      });

      if (inserted.error?.code === UNIQUE_VIOLATION) {
        // Another change on the same base was stored first.
        return { kind: "stale", current: (await readOntology(client)).version };
      }

      dataOf("storing the ontology", inserted);
      changed.next(undefined);

      return applied;
    },
  };
}

/** How the store reads. Not part of the port: the composition root leaves it out. */
export interface OntologyStoreOptions {
  /** Reads the ontology a change set is applied to; a test passes one that reads an earlier version, as the loser of a race did. */
  readBase?: (client: Client) => Promise<Ontology>;
}

/** The signed-in owner's latest ontology, parsed; an empty one at version 0 when they have none. */
export async function readOntology(client: Client): Promise<Ontology> {
  const row = dataOf(
    "reading the ontology",
    await client
      .from("ontology_versions")
      .select("ontology")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  return row === null ? createEmptyOntology() : Ontology.parse(row.ontology);
}

const UNIQUE_VIOLATION = "23505";

function createEmptyOntology(): Ontology {
  return {
    format: 1,
    version: 0,
    objectTypes: [],
    linkTypes: [],
    actionTypes: [],
  };
}
