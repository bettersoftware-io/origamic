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
 *
 * Where it can differ from the simulator. "Code units" is Postgres's
 * `COLLATE "C"`: UTF-8 byte order, which is code point order. It agrees with
 * UTF-16 code units except between a supplementary character (U+10000 and
 * above, a surrogate pair in UTF-16) and one of U+E000 to U+FFFF: UTF-16 puts
 * the supplementary one first, Postgres last. `contains` is ILIKE, which
 * lowercases by the database's ctype (en_US.UTF-8), where the simulator uses
 * JavaScript's `toLowerCase`: the two agree on ASCII, and can differ on
 * other scripts' case folding (a final sigma, a dotted capital I).
 *
 * The API cuts each answer at `max_rows` (1000, in config.toml), so a view
 * is read in pages of `pageSize` rows until a page comes back short. The
 * function's order ends in `created_at, id`, so the pages of one read meet
 * without a gap or an overlap while nothing is written between them.
 */
export function createSupabaseObjectStore(
  client: Client,
  options: ObjectStoreOptions = {},
): ObjectStorePort {
  const executed = new BehaviorSubject<undefined>(undefined);
  const pageSize = options.pageSize ?? MAX_ROWS;

  return {
    view: (query: ViewQuery): Observable<readonly StoredObject[]> => {
      return executed.pipe(
        switchMap(() => {
          return from(readView(client, query, pageSize));
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

/** How the store reads. Not part of the port: the composition root leaves it out. */
export interface ObjectStoreOptions {
  /** Rows a view reads at a time; never more than the API's `max_rows`, or a cut page would read as the last. */
  pageSize?: number;
}

/** `max_rows` in packages/adapters/supabase/config.toml. */
const MAX_ROWS = 1000;

/** Every object the view reads, a page at a time; the function applies the query's `limit`. */
async function readView(
  client: Client,
  query: ViewQuery,
  pageSize: number,
): Promise<StoredObject[]> {
  const objects: StoredObject[] = [];

  for (let start = 0; ; start += pageSize) {
    const page = dataOf(
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
        .order("ordinal")
        .range(start, start + pageSize - 1),
    );

    objects.push(...page.map(parseObjectRow));

    if (page.length < pageSize) {
      return objects;
    }
  }
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
 * write fails the insert on its foreign key, and is refused as one that is
 * not there.
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
      inserted.error?.code === candidate.code &&
      inserted.error.message.includes(`"${candidate.constraint}"`)
    );
  });

  if (refusal !== undefined) {
    return rejected(refusal.path, describe(refusal.message, link));
  }

  dataOf(`linking "${link.from}" to "${link.to}"`, inserted);

  return { kind: "done", id: link.from };
}

/** A link the table refuses: the error code, the constraint, and what the refusal says of the link. */
interface Refusal {
  code: string;
  constraint: string;
  path: string;
  /** `{from}`, `{to}` and `{linkType}` stand for the link's. */
  message: string;
}

const REFUSALS: readonly Refusal[] = [
  {
    code: "23505",
    constraint: "links_one_pair",
    path: "to",
    message: '"{from}" is already linked to "{to}" by "{linkType}"',
  },
  {
    code: "23505",
    constraint: "links_one_from",
    path: "target",
    message: '"{from}" already has its one "{linkType}"',
  },
  {
    code: "23505",
    constraint: "links_one_to",
    path: "to",
    message: '"{to}" is already the one end of a "{linkType}"',
  },
  // An end deleted between the store's read of it and the write.
  {
    code: "23503",
    constraint: "links_owner_from_id_fkey",
    path: "target",
    message: '"{from}" is not there any more',
  },
  {
    code: "23503",
    constraint: "links_owner_to_id_fkey",
    path: "to",
    message: '"{to}" is not there any more',
  },
];

function describe(message: string, link: Link): string {
  return message
    .replaceAll("{from}", link.from)
    .replaceAll("{to}", link.to)
    .replaceAll("{linkType}", link.linkType);
}

function rejected(path: string, message: string): ActionResult {
  const problems: Problem[] = [{ path, message }];

  return { kind: "rejected", problems };
}
