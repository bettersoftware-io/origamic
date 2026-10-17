import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The first migration, held to what ADR-0001 and ADR-0004 say of it: every
// table is owner-scoped, and row-level security lets an owner see and write
// their own rows only. Two users, each made afresh, talk to a local Supabase
// as the browser will: with the anonymous key and their own session.
describe("the tables of the first migration", () => {
  beforeAll(async () => {
    owners = await createOwners();
    aBook = await writeOneOfEach(owners.a.client);
  });

  afterAll(async () => {
    await owners.remove();
  });

  it("an owner reads back the object they wrote", async () => {
    const { data, error } = await owners.a.client
      .from("objects")
      .select("owner, type, type_version, data")
      .eq("type", "Book");

    expect(error).toBeNull();
    expect(data).toEqual([
      {
        owner: owners.a.id,
        type: "Book",
        type_version: 1,
        data: { title: "Dune" },
      },
    ]);
  });

  it("another owner reads none of it", async () => {
    for (const table of TABLES) {
      const theirs = await owners.a.client.from(table).select();
      const mine = await owners.b.client.from(table).select();

      expect(theirs.error, `${table}, read by its owner`).toBeNull();
      expect(theirs.data, `${table}, read by its owner`).not.toEqual([]);
      expect(mine.error, table).toBeNull();
      expect(mine.data, table).toEqual([]);
    }
  });

  it("another owner cannot write into it", async () => {
    const { error } = await owners.b.client.from("objects").insert({
      owner: owners.a.id,
      type: "Book",
      type_version: 1,
      data: { title: "Not yours" },
    });

    expect(error?.code).toBe("42501");
  });

  it("a link cannot reach another owner's object", async () => {
    const bBook = await writeObject(owners.b.client, {
      type: "Book",
      type_version: 1,
      data: { title: "Emma" },
    });

    const attempts = [
      { from_id: aBook, to_id: bBook },
      { from_id: bBook, to_id: aBook },
    ];

    for (const ends of attempts) {
      const { error } = await owners.a.client.from("links").insert({
        link_type: "writtenBy",
        cardinality: "many-to-many",
        ...ends,
      });

      expect(error?.code).toBe("23503");
    }

    const { data } = await owners.b.client
      .from("objects")
      .select("id, owner, data");

    expect(data).toEqual([
      { id: bBook, owner: owners.b.id, data: { title: "Emma" } },
    ]);
  });

  let owners: Owners;
  /** The id of the book owner A wrote. */
  let aBook: string;
});

const TABLES = [
  "objects",
  "links",
  "ontology_versions",
  "apps",
  "workspaces",
] as const;

/** Each table's columns as the migration declares them. `owner` is filled in by the database. */
type Database = {
  public: {
    Tables: {
      ontology_versions: Table<OntologyRow, OntologyInsert>;
      objects: Table<ObjectRow, ObjectInsert>;
      links: Table<LinkRow, LinkInsert>;
      apps: Table<SpecRow, SpecInsert>;
      workspaces: Table<SpecRow, SpecInsert>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};

// Type aliases, not interfaces: supabase-js asks each row for an index
// signature, which only an alias has.
type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

type OntologyRow = {
  owner: string;
  version: number;
  ontology: unknown;
  change: unknown;
  created_at: string;
};

type OntologyInsert = {
  owner?: string;
  version: number;
  ontology: unknown;
  change?: unknown;
};

type ObjectRow = {
  id: string;
  owner: string;
  type: string;
  type_version: number;
  data: unknown;
  created_at: string;
  updated_at: string;
};

type ObjectInsert = {
  id?: string;
  owner?: string;
  type: string;
  type_version: number;
  data: unknown;
};

type LinkRow = {
  id: string;
  owner: string;
  link_type: string;
  cardinality: string;
  from_id: string;
  to_id: string;
  created_at: string;
  updated_at: string;
};

type LinkInsert = {
  id?: string;
  owner?: string;
  link_type: string;
  cardinality: string;
  from_id: string;
  to_id: string;
};

type SpecRow = {
  owner: string;
  id: string;
  version: number;
  spec: unknown;
  created_at: string;
};

type SpecInsert = {
  owner?: string;
  id: string;
  version: number;
  spec: unknown;
};

type Client = SupabaseClient<Database>;

interface Owner {
  id: string;
  client: Client;
}

interface Owners {
  a: Owner;
  b: Owner;
  /** Deletes both users, and with them every row they own. */
  remove: () => Promise<void>;
}

/** Two users, each signed in on a client of their own. */
async function createOwners(): Promise<Owners> {
  const admin = createClient<Database>(
    environment("SUPABASE_URL"),
    environment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const a = await createOwner(admin);
  const b = await createOwner(admin);

  return {
    a,
    b,
    remove: async () => {
      for (const { id } of [a, b]) {
        const { error } = await admin.auth.admin.deleteUser(id);

        if (error) {
          throw error;
        }
      }
    },
  };
}

/** A user with a fresh e-mail, made through the admin API and signed in. */
async function createOwner(admin: Client): Promise<Owner> {
  const email = `${crypto.randomUUID()}@origamic.test`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error) {
    throw created.error;
  }

  const client = createClient<Database>(
    environment("SUPABASE_URL"),
    environment("SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { id: created.data.user.id, client };
}

/** A row in every table, written as their owner. Gives the book's id. */
async function writeOneOfEach(client: Client): Promise<string> {
  await expectNoError(
    client
      .from("ontology_versions")
      .insert({ version: 1, ontology: { types: [] } }),
  );

  const book = await writeObject(client, {
    type: "Book",
    type_version: 1,
    data: { title: "Dune" },
  });

  const author = await writeObject(client, {
    type: "Author",
    type_version: 1,
    data: { name: "Frank Herbert" },
  });

  await expectNoError(
    client.from("links").insert({
      link_type: "writtenBy",
      cardinality: "many-to-many",
      from_id: book,
      to_id: author,
    }),
  );
  await expectNoError(
    client
      .from("apps")
      .insert({ id: "books", version: 1, spec: { kind: "app" } }),
  );
  await expectNoError(
    client
      .from("workspaces")
      .insert({ id: "home", version: 1, spec: { panels: [] } }),
  );

  return book;
}

/** An object written as the client's owner. Gives its id. */
async function writeObject(
  client: Client,
  object: ObjectInsert,
): Promise<string> {
  const { data, error } = await client
    .from("objects")
    .insert(object)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id;
}

interface Outcome {
  error: Error | null;
}

async function expectNoError(write: PromiseLike<Outcome>): Promise<void> {
  const { error } = await write;

  if (error) {
    throw error;
  }
}

/** A variable the global setup sets from the running stack. */
function environment(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(
      `${name} is not set: the global setup (tools/supabase/globalSetup.mts) sets it from the local Supabase`,
    );
  }

  return value;
}
