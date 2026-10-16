import { BehaviorSubject, from, type Observable, switchMap } from "rxjs";

import {
  type ActionInvocation,
  type ActionResult,
  type ObjectStorePort,
  type ObjectWrite,
  planWrite,
  type StoredObject,
  type ViewQuery,
} from "@origamic/core";
import type { Ontology, Problem } from "@origamic/spec";

import {
  type Client,
  dataOf,
  isObjectId,
  OBJECT_COLUMNS,
  parseObjectRow,
} from "./rows.ts";
import { readOntology } from "./supabaseOntologyStore.ts";

/**
 * The ObjectStorePort on the `objects` and `links` tables, for the
 * signed-in owner. `execute` reads the owner's latest ontology and the object
 * the invocation names, asks `planWrite` what to write, and writes that, or
 * nothing (ADR-0009). What `planWrite` cannot see is checked here: a link's
 * far end by a read, and its cardinality by the table's unique indexes, so
 * that two links written at once cannot both pass. A view is read by the
 * database function `view_objects`, which orders and compares as the port
 * says, and is read again after each action executed through this store.
 */
export function createSupabaseObjectStore(client: Client): ObjectStorePort {
  const executed = new BehaviorSubject<undefined>(undefined);

  return {
    view: (query: ViewQuery): Observable<readonly StoredObject[]> => {
      return executed.pipe(
        switchMap(() => {
          return from(readView(client, query));
        }),
      );
    },
    execute: async (invocation: ActionInvocation): Promise<ActionResult> => {
      const ontology = await readOntology(client);
      const target =
        invocation.target === undefined
          ? null
          : await readObject(client, invocation.target);
      const planned = planWrite(ontology, invocation, target);

      if (planned.kind === "rejected") {
        return planned;
      }

      const result = await write(client, planned.write, ontology);

      if (result.kind === "done") {
        executed.next(undefined);
      }

      return result;
    },
  };
}

async function readView(
  client: Client,
  query: ViewQuery,
): Promise<StoredObject[]> {
  const rows = dataOf(
    `reading a view of "${query.type}"`,
    await client
      .rpc("view_objects", {
        query: {
          type: query.type,
          filter: query.filter,
          sort: query.sort,
          limit: query.limit ?? null,
        },
      })
      .order("ordinal"),
  );

  return rows.map(parseObjectRow);
}

/** The owner's object with that id, or `null`. An id that is not a UUID names none. */
async function readObject(
  client: Client,
  id: string,
): Promise<StoredObject | null> {
  if (!isObjectId(id)) {
    return null;
  }

  const row = dataOf(
    `reading the object "${id}"`,
    await client
      .from("objects")
      .select(OBJECT_COLUMNS)
      .eq("id", id)
      .maybeSingle(),
  );

  return row === null ? null : parseObjectRow(row);
}

/** Carries out what `planWrite` planned. */
async function write(
  client: Client,
  planned: ObjectWrite,
  ontology: Ontology,
): Promise<ActionResult> {
  switch (planned.kind) {
    case "create": {
      const created = dataOf(
        `creating a "${planned.type}"`,
        await client
          .from("objects")
          .insert({
            type: planned.type,
            type_version: planned.typeVersion,
            data: planned.values,
          })
          .select("id")
          .single(),
      );

      return { kind: "done", id: created.id };
    }

    case "update": {
      const updated = dataOf(
        `updating "${planned.id}"`,
        await client
          .from("objects")
          .update({ type_version: planned.typeVersion, data: planned.values })
          .eq("id", planned.id)
          .select("id"),
      );

      // Deleted since `execute` read it.
      return updated.length === 0
        ? rejected("target", `"${planned.id}" is not there any more`)
        : { kind: "done", id: planned.id };
    }

    case "delete": {
      // The object's links go with it: each end is a foreign key that
      // cascades.
      dataOf(
        `deleting "${planned.id}"`,
        await client.from("objects").delete().eq("id", planned.id),
      );

      return { kind: "done", id: planned.id };
    }

    case "link":
      return addLink(client, planned, ontology);
  }
}

interface Link {
  linkType: string;
  from: string;
  to: string;
}

/**
 * A link goes to an object of its far end's type that is there, and as many
 * times as its cardinality allows. An end deleted between the read and the
 * write fails the insert on its foreign key, which is not a refusal the port
 * has words for: it is thrown.
 */
async function addLink(
  client: Client,
  link: Link,
  ontology: Ontology,
): Promise<ActionResult> {
  const to = await readObject(client, link.to);
  // `planWrite` found the link type; what it could not see is the far end.
  const linkType = ontology.linkTypes.find((candidate) => {
    return candidate.name === link.linkType && candidate.to === to?.type;
  });

  if (linkType === undefined) {
    return rejected(
      "to",
      `"${link.linkType}" links to an object of its far end's type, and "${link.to}" is not one`,
    );
  }

  const inserted = await client.from("links").insert({
    link_type: link.linkType,
    from_id: link.from,
    to_id: link.to,
    cardinality: linkType.cardinality,
  });

  const refusal = REFUSALS.find((candidate) => {
    return (
      inserted.error?.code === UNIQUE_VIOLATION &&
      inserted.error.message.includes(`"${candidate.index}"`)
    );
  });

  if (refusal !== undefined) {
    return rejected(refusal.path, refusal.says(link));
  }

  dataOf(`linking "${link.from}" to "${link.to}"`, inserted);

  return { kind: "done", id: link.from };
}

const UNIQUE_VIOLATION = "23505";

/** A link the table's unique indexes refuse: the index, and what the refusal says. */
interface Refusal {
  index: string;
  path: string;
  says: (link: Link) => string;
}

const REFUSALS: readonly Refusal[] = [
  {
    index: "links_one_pair",
    path: "to",
    says: (link: Link): string => {
      return `"${link.from}" is already linked to "${link.to}" by "${link.linkType}"`;
    },
  },
  {
    index: "links_one_from",
    path: "target",
    says: (link: Link): string => {
      return `"${link.from}" already has its one "${link.linkType}"`;
    },
  },
  {
    index: "links_one_to",
    path: "to",
    says: (link: Link): string => {
      return `"${link.to}" is already the one end of a "${link.linkType}"`;
    },
  },
];

function rejected(path: string, message: string): ActionResult {
  const problems: Problem[] = [{ path, message }];

  return { kind: "rejected", problems };
}
