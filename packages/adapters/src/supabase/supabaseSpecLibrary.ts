import { BehaviorSubject, from, type Observable, switchMap } from "rxjs";

import type { LibraryEntry, SpecLibraryPort } from "@origamic/core";
import {
  App,
  type AppDraft,
  Workspace,
  type WorkspaceDraft,
} from "@origamic/spec";

import { type Client, dataOf } from "./rows.ts";

/**
 * The SpecLibraryPort on the `apps` and `workspaces` tables: one row for each
 * version of each id, never changed once written (ADR-0005). A save reads the
 * latest version of its id and writes the next; when another save took that
 * version first, the table's key refuses it, and the save reads again.
 */
export function createSupabaseSpecLibrary(client: Client): SpecLibraryPort {
  const apps = createShelf(client, "apps", (value) => {
    return App.parse(value);
  });

  const workspaces = createShelf(client, "workspaces", (value) => {
    return Workspace.parse(value);
  });

  return {
    apps: (): Observable<readonly LibraryEntry[]> => {
      return apps.entries();
    },
    workspaces: (): Observable<readonly LibraryEntry[]> => {
      return workspaces.entries();
    },
    loadApp: (id: string, version?: number): Promise<App | null> => {
      return apps.load(id, version);
    },
    saveApp: (draft: AppDraft): Promise<App> => {
      return apps.save(draft);
    },
    loadWorkspace: (
      id: string,
      version?: number,
    ): Promise<Workspace | null> => {
      return workspaces.load(id, version);
    },
    saveWorkspace: (draft: WorkspaceDraft): Promise<Workspace> => {
      return workspaces.save(draft);
    },
  };
}

/** How many times a save reads the latest version and tries the next one before it gives up. */
const ATTEMPTS = 3;

const UNIQUE_VIOLATION = "23505";

type Kind = "apps" | "workspaces";

interface Draft {
  id: string;
  name: string;
}

interface Versioned extends Draft {
  version: number;
}

interface Shelf<T extends Versioned> {
  entries: () => Observable<readonly LibraryEntry[]>;
  load: (id: string, version: number | undefined) => Promise<T | null>;
  save: (draft: Draft) => Promise<T>;
}

/** Every version of one kind of spec, in its table. `parse`, the spec's own schema, reads each row. */
function createShelf<T extends Versioned>(
  client: Client,
  kind: Kind,
  parse: (value: unknown) => T,
): Shelf<T> {
  const saved = new BehaviorSubject<undefined>(undefined);

  async function latestVersion(id: string): Promise<number> {
    const row = dataOf(
      `reading the latest of "${id}" in ${kind}`,
      await client
        .from(kind)
        .select("version")
        .eq("id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );

    return row?.version ?? 0;
  }

  return {
    entries: (): Observable<readonly LibraryEntry[]> => {
      return saved.pipe(
        switchMap(() => {
          return from(readEntries(client, kind, parse));
        }),
      );
    },
    load: async (
      id: string,
      version: number | undefined,
    ): Promise<T | null> => {
      const query = client.from(kind).select("id, version, spec").eq("id", id);
      const row = dataOf(
        `loading "${id}" from ${kind}`,
        await (version === undefined
          ? query.order("version", { ascending: false }).limit(1)
          : query.eq("version", version)
        ).maybeSingle(),
      );

      return row === null ? null : parseRow(kind, row, parse);
    },
    save: async (draft: Draft): Promise<T> => {
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        const spec = parse({
          ...draft,
          version: (await latestVersion(draft.id)) + 1,
        });

        const inserted = await client
          .from(kind)
          .insert({ id: spec.id, version: spec.version, spec });

        // A key taken means another save took this version first: read again.
        if (inserted.error?.code !== UNIQUE_VIOLATION) {
          dataOf(`saving "${draft.id}" in ${kind}`, inserted);
          saved.next(undefined);

          return spec;
        }
      }

      throw new Error(
        `saving "${draft.id}" in ${kind} failed: another save took the next version ${ATTEMPTS} times`,
      );
    },
  };
}

/** The latest version of each id, with its name, from the view of the latest of each. */
async function readEntries<T extends Versioned>(
  client: Client,
  kind: Kind,
  parse: (value: unknown) => T,
): Promise<LibraryEntry[]> {
  const rows = dataOf(
    `reading the ${kind}`,
    await client
      .from(kind === "apps" ? "latest_apps" : "latest_workspaces")
      .select("id, version, spec")
      .order("id"),
  );

  return rows.map((row) => {
    const spec = parseRow(kind, row, parse);

    return { id: spec.id, name: spec.name, latest: spec.version };
  });
}

interface SpecColumns {
  id: string;
  version: number;
  spec: unknown;
}

/** A row's spec, parsed, and held to the id and the version the row is keyed by. */
function parseRow<T extends Versioned>(
  kind: Kind,
  row: SpecColumns,
  parse: (value: unknown) => T,
): T {
  const spec = parse(row.spec);

  if (spec.id !== row.id || spec.version !== row.version) {
    throw new Error(
      `the row "${row.id}" at version ${row.version} in ${kind} holds "${spec.id}" at version ${spec.version}`,
    );
  }

  return spec;
}
