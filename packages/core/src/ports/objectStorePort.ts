import type { Observable } from "rxjs";

import type { JsonValue, Problem, Row } from "@origamic/spec";

export type ObjectId = string;

/** An object as the store keeps it: the type it is an instance of, and the version of that type it was last written at (ADR-0005). */
export interface StoredObject extends Row {
  id: ObjectId;
  type: string;
  typeVersion: number;
}

/** One condition of a view. A value of a property an object does not have reads as `null`. */
export interface ViewFilter {
  property: string;
  /**
   * `eq` and `neq` compare JSON values. `gt` and `lt` compare two numbers as
   * numbers and two strings by their code units (so ISO dates in order), and
   * are false for anything else. `contains` is a substring of a string,
   * ignoring case.
   */
  op: "eq" | "neq" | "contains" | "gt" | "lt";
  value: JsonValue;
}

/** One key of a view's order. Numbers sort as numbers. An object without the property sorts last, either way. */
export interface ViewSort {
  property: string;
  dir: "asc" | "desc";
}

/** A read of the objects of one type, at every version of it, as a UI spec's view resolves to. */
export interface ViewQuery {
  type: string;
  filter: readonly ViewFilter[];
  sort: readonly ViewSort[];
  limit?: number;
}

/** A call of a named action at the version the app binds (ADR-0008). */
export interface ActionInvocation {
  action: string;
  version: number;
  /** The object an `update`, a `delete` or a `link` acts on. */
  target?: ObjectId;
  input: Readonly<Record<string, JsonValue>>;
}

/** What executing an action gives: the id of the object it made or acted on, or every reason it was refused. */
export type ActionResult =
  | { kind: "done"; id: ObjectId }
  | { kind: "rejected"; problems: readonly Problem[] };

/**
 * The owner's objects. Every write is a named action (ADR-0008): `execute`
 * checks the invocation against the ontology with `planWrite` and writes
 * nothing when it is refused (ADR-0009).
 */
export interface ObjectStorePort {
  /** Emits at once, and again after each action executed through this store. */
  view(query: ViewQuery): Observable<readonly StoredObject[]>;
  execute(invocation: ActionInvocation): Promise<ActionResult>;
}

/** The port by the name the rest of Origamic uses. The file and the interface carry `Port` for the contract gate. */
export type ObjectStore = ObjectStorePort;
