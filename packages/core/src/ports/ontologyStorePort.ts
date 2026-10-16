import type { Observable } from "rxjs";

import type { Applied, ChangeSet, Ontology } from "@origamic/spec";

/**
 * The owner's ontology. It applies change sets and never proposes one
 * (ADR-0012): a proposal is a value in `core` until the builder accepts it.
 */
export interface OntologyStorePort {
  /** The owner's latest ontology; an owner with none has { format: 1, version: 0, objectTypes: [] }. Emits at once, and again after each change applied through this store. */
  current(): Observable<Ontology>;
  /** Applies a change set whole, and only to the version it was written against (`applyChangeSet`). Nothing is stored unless it is `applied`. */
  apply(change: ChangeSet): Promise<Applied>;
}

/** The port by the name the rest of Origamic uses. The file and the interface carry `Port` for the contract gate. */
export type OntologyStore = OntologyStorePort;
