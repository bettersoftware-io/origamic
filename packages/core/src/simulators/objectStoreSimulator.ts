import { BehaviorSubject, firstValueFrom, map, type Observable } from "rxjs";

import type { JsonValue, Ontology, Problem } from "@origamic/spec";

import { type ObjectWrite, planWrite } from "#/actions/planWrite.ts";
import type {
  ActionInvocation,
  ActionResult,
  ObjectId,
  ObjectStorePort,
  StoredObject,
  ViewFilter,
  ViewQuery,
  ViewSort,
} from "#/ports/objectStorePort.ts";
import type { OntologyStorePort } from "#/ports/ontologyStorePort.ts";

/**
 * The ObjectStorePort in memory, for one owner, starting with `objects`. It
 * checks each action against the ontology `ontology` holds when it runs,
 * with `planWrite`, as every ObjectStorePort does.
 */
export function createObjectStoreSimulator(
  ontology: OntologyStorePort,
  objects: readonly StoredObject[] = [],
): ObjectStorePort {
  const state = new BehaviorSubject<Stored>({
    objects: new Map(
      objects.map((object) => {
        return [object.id, { ...object, values: { ...object.values } }];
      }),
    ),
    links: [],
  });
  let made = 0;

  /** An id no object of the store has. */
  function nextId(): ObjectId {
    made += 1;

    const id = `object-${made}`;

    return state.getValue().objects.has(id) ? nextId() : id;
  }

  return {
    view: (query: ViewQuery): Observable<readonly StoredObject[]> => {
      return state.pipe(
        map((stored) => {
          return read(stored.objects, query);
        }),
      );
    },
    execute: async (invocation: ActionInvocation): Promise<ActionResult> => {
      const current = await firstValueFrom(ontology.current());
      const stored = state.getValue();
      const target =
        invocation.target === undefined
          ? null
          : (stored.objects.get(invocation.target) ?? null);
      const planned = planWrite(current, invocation, target);

      if (planned.kind === "rejected") {
        return planned;
      }

      const written = write(stored, planned.write, current, nextId);

      if (written.kind === "rejected") {
        return written;
      }

      state.next(written.stored);

      return { kind: "done", id: written.id };
    },
  };
}

interface Link {
  linkType: string;
  from: ObjectId;
  to: ObjectId;
}

/** What the store holds. Each write makes a new one and changes no object in place, so what a view emitted stays as it was. */
interface Stored {
  objects: ReadonlyMap<ObjectId, StoredObject>;
  links: readonly Link[];
}

type Written =
  | { kind: "written"; stored: Stored; id: ObjectId }
  | { kind: "rejected"; problems: Problem[] };

/** Carries out a planned write. What `planWrite` cannot see, since it needs the other objects and links, is checked here. */
function write(
  stored: Stored,
  planned: ObjectWrite,
  ontology: Ontology,
  nextId: () => ObjectId,
): Written {
  const objects = new Map(stored.objects);

  switch (planned.kind) {
    case "create": {
      const id = nextId();

      objects.set(id, {
        id,
        type: planned.type,
        typeVersion: planned.typeVersion,
        values: planned.values,
      });

      return { kind: "written", stored: { ...stored, objects }, id };
    }

    case "update": {
      const updated = new Map(
        [...stored.objects].map(([id, object]) => {
          return [
            id,
            id === planned.id
              ? {
                  ...object,
                  typeVersion: planned.typeVersion,
                  values: planned.values,
                }
              : object,
          ];
        }),
      );

      return {
        kind: "written",
        stored: { ...stored, objects: updated },
        id: planned.id,
      };
    }

    case "delete": {
      objects.delete(planned.id);

      const links = stored.links.filter((link) => {
        return link.from !== planned.id && link.to !== planned.id;
      });

      return { kind: "written", stored: { objects, links }, id: planned.id };
    }

    case "link":
      return addLink(stored, planned, ontology);
  }
}

/** A link goes to an object of its type that is there, and as many times as its cardinality allows. */
function addLink(stored: Stored, link: Link, ontology: Ontology): Written {
  const to = stored.objects.get(link.to);
  // `planWrite` found the link type; what it could not see is the far end.
  const linkType = ontology.linkTypes.find((candidate) => {
    return candidate.name === link.linkType && candidate.to === to?.type;
  });

  if (linkType === undefined) {
    return refused(
      "to",
      `"${link.linkType}" links to an object of its far end's type, and "${link.to}" is not one`,
    );
  }

  const sameType = stored.links.filter((existing) => {
    return existing.linkType === link.linkType;
  });
  const oneFrom = linkType.cardinality === "one-to-one";
  const oneTo = linkType.cardinality !== "many-to-many";

  if (
    sameType.some((existing) => {
      return existing.from === link.from && existing.to === link.to;
    })
  ) {
    return refused(
      "to",
      `"${link.from}" is already linked to "${link.to}" by "${link.linkType}"`,
    );
  }

  if (
    oneFrom &&
    sameType.some((existing) => {
      return existing.from === link.from;
    })
  ) {
    return refused(
      "target",
      `"${link.from}" already has its one "${link.linkType}"`,
    );
  }

  if (
    oneTo &&
    sameType.some((existing) => {
      return existing.to === link.to;
    })
  ) {
    return refused(
      "to",
      `"${link.to}" is already the one end of a "${link.linkType}"`,
    );
  }

  return {
    kind: "written",
    stored: { ...stored, links: [...stored.links, link] },
    id: link.from,
  };
}

function refused(path: string, message: string): Written {
  return { kind: "rejected", problems: [{ path, message }] };
}

/** The objects of the query's type, at every version of it, filtered, in order, and cut to its limit. */
function read(
  objects: ReadonlyMap<ObjectId, StoredObject>,
  query: ViewQuery,
): readonly StoredObject[] {
  const rows = [...objects.values()]
    .filter((object) => {
      return (
        object.type === query.type &&
        query.filter.every((filter) => {
          return matches(propertyOf(object, filter.property), filter);
        })
      );
    })
    .sort((left, right) => {
      return compareBy(query.sort, left, right);
    });

  return query.limit === undefined ? rows : rows.slice(0, query.limit);
}

/** A value an object does not have reads as `null`. */
function propertyOf(object: StoredObject, property: string): JsonValue {
  return Object.hasOwn(object.values, property)
    ? (object.values[property] ?? null)
    : null;
}

function matches(value: JsonValue, filter: ViewFilter): boolean {
  switch (filter.op) {
    case "eq":
      return sameJson(value, filter.value);
    case "neq":
      return !sameJson(value, filter.value);
    case "contains":
      return (
        typeof value === "string" &&
        typeof filter.value === "string" &&
        value.toLowerCase().includes(filter.value.toLowerCase())
      );
    case "gt":
      return (order(value, filter.value) ?? 0) > 0;
    case "lt":
      return (order(value, filter.value) ?? 0) < 0;
  }
}

/** Two numbers as numbers, two strings by their code units; anything else has no order. */
function order(left: JsonValue, right: JsonValue): number | undefined {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "string" && typeof right === "string") {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  return undefined;
}

/** By each key in turn. An object without the property sorts after those with it, either way. */
function compareBy(
  sort: readonly ViewSort[],
  left: StoredObject,
  right: StoredObject,
): number {
  for (const key of sort) {
    const a = propertyOf(left, key.property);
    const b = propertyOf(right, key.property);

    if (a === null || b === null) {
      if (a !== b) {
        return a === null ? 1 : -1;
      }

      continue;
    }

    const compared = compareJson(a, b);

    if (compared !== 0) {
      return key.dir === "asc" ? compared : -compared;
    }
  }

  return 0;
}

/**
 * A total order of JSON values, as Postgres orders `jsonb` (PostgreSQL
 * documentation, 8.14.4 "jsonb Indexing"): "Object > Array > Boolean >
 * Number > String > Null"; an object with n pairs after one with n - 1, an
 * array with n elements after one with n - 1; arrays of one length element
 * by element; objects with as many pairs key by key and value by value, in
 * the order `jsonb` stores keys (shorter first, then by bytes). Primitives
 * compare as their own types do, a string by code units (`COLLATE "C"`).
 * Its one exception, an empty top-level array before null, never meets a
 * null here: `compareBy` puts a missing value last first.
 */
function compareJson(left: JsonValue, right: JsonValue): number {
  const byRank = rankOf(left) - rankOf(right);

  if (byRank !== 0) {
    return byRank;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return compareLists(left, right);
  }

  if (isRecord(left) && isRecord(right)) {
    return compareRecords(left, right);
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return order(left, right) ?? 0;
}

const RANK = ["null", "string", "number", "boolean", "array", "object"];

function rankOf(value: JsonValue): number {
  if (value === null) {
    return RANK.indexOf("null");
  }

  return RANK.indexOf(Array.isArray(value) ? "array" : typeof value);
}

function compareLists(
  left: readonly JsonValue[],
  right: readonly JsonValue[],
): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }

  for (const [index, value] of left.entries()) {
    const compared = compareJson(value, right[index] ?? null);

    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

interface JsonRecord {
  [key: string]: JsonValue;
}

function compareRecords(left: JsonRecord, right: JsonRecord): number {
  const leftKeys = storedKeyOrder(left);
  const rightKeys = storedKeyOrder(right);

  if (leftKeys.length !== rightKeys.length) {
    return leftKeys.length - rightKeys.length;
  }

  for (const [index, key] of leftKeys.entries()) {
    const other = rightKeys[index] ?? "";
    const compared =
      compareKeys(key, other) ||
      compareJson(left[key] ?? null, right[other] ?? null);

    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

/** The order `jsonb` stores an object's keys in: shorter first, then by code units. */
function storedKeyOrder(record: JsonRecord): string[] {
  return Object.keys(record).sort(compareKeys);
}

function compareKeys(left: string, right: string): number {
  return left.length - right.length || (order(left, right) ?? 0);
}

function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
