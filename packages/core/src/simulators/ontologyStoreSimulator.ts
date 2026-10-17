import { BehaviorSubject, type Observable } from "rxjs";

import {
  type Applied,
  applyChangeSet,
  type ChangeSet,
  type Ontology,
} from "@origamic/spec";

import type { OntologyStorePort } from "#/ports/ontologyStorePort.ts";

/**
 * The OntologyStorePort in memory, for one owner. It starts with `initial`,
 * or with the empty ontology of an owner who has none, and keeps every
 * change set it applies.
 */
export function createOntologyStoreSimulator(
  initial: Ontology = createEmptyOntology(),
): OntologyStorePort {
  const current = new BehaviorSubject(initial);

  return {
    current: (): Observable<Ontology> => {
      return current.asObservable();
    },
    apply: (change: ChangeSet): Promise<Applied> => {
      const applied = applyChangeSet(current.getValue(), change);

      if (applied.kind === "applied") {
        current.next(applied.ontology);
      }

      return Promise.resolve(applied);
    },
  };
}

function createEmptyOntology(): Ontology {
  return {
    format: 1,
    version: 0,
    objectTypes: [],
    linkTypes: [],
    actionTypes: [],
  };
}
