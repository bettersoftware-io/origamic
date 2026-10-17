import type {
  PostgrestSingleResponse,
  SupabaseClient,
} from "@supabase/supabase-js";

import type { StoredObject } from "@origamic/core";
import { Id, Json, type JsonValue, Name, Version } from "@origamic/spec";

// The tables and the function of the migrations in ../../supabase/migrations,
// as supabase-js types a client by them, and the parsing of what a read
// gives back. Every row is parsed by a schema of `spec` before it leaves the
// adapter: nothing the database holds is trusted to be what the client wrote.

/** The `public` schema, as `createClient<Database>` reads it. `owner` is filled in by the database. */
export type Database = {
  public: {
    Tables: {
      ontology_versions: Table<OntologyRow, OntologyInsert>;
      objects: Table<ObjectRow, ObjectInsert>;
      links: Table<LinkRow, LinkInsert>;
      apps: Table<SpecRow, SpecInsert>;
      workspaces: Table<SpecRow, SpecInsert>;
    };
    Views: {
      latest_apps: View<SpecRow>;
      latest_workspaces: View<SpecRow>;
    };
    Functions: {
      view_objects: { Args: ViewArgs; Returns: ViewRow[] };
    };
  };
};

/** A client of the project, typed by its tables. */
export type Client = SupabaseClient<Database>;

// Type aliases, not interfaces: supabase-js asks each row for an index
// signature, which only an alias has.
type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

type View<Row> = {
  Row: Row;
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

type ViewArgs = {
  query: unknown;
};

type ViewRow = {
  id: string;
  type: string;
  type_version: number;
  data: unknown;
  ordinal: number;
};

/** The columns of an object a read selects. */
export const OBJECT_COLUMNS = "id, type, type_version, data";

/** An object as a read of `OBJECT_COLUMNS` gives it. */
export interface ObjectColumns {
  id: string;
  type: string;
  type_version: number;
  data: unknown;
}

/** An object row, parsed. */
export function parseObjectRow(row: ObjectColumns): StoredObject {
  return {
    id: Id.parse(row.id),
    type: Name.parse(row.type),
    typeVersion: Version.parse(row.type_version),
    values: parseValues(row.data),
  };
}

/** Whether an id can name an object: the table keys objects by UUID, and refuses any other text. */
export function isObjectId(id: string): boolean {
  return UUID.test(id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An object's values: JSON, an object, and each value a scalar, as every property type is one. */
function parseValues(data: unknown): Record<string, JsonValue> {
  const values = Json.parse(data);

  if (!isRecord(values)) {
    throw new Error("an object's values are a JSON object");
  }

  for (const [property, value] of Object.entries(values)) {
    if (value !== null && typeof value === "object") {
      throw new Error(`"${property}" holds a value that is not a scalar`);
    }
  }

  return values;
}

interface JsonRecord {
  [key: string]: JsonValue;
}

function isRecord(value: JsonValue): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The data of a query, or an error that says what failed. A refusal the
 * port has words for (a key taken, a link's end gone) is looked at before
 * this; whatever is left is a failure of the database or the network.
 */
export function dataOf<T>(
  what: string,
  outcome: PostgrestSingleResponse<T>,
): T {
  if (outcome.error !== null) {
    throw new Error(`${what} failed: ${outcome.error.message}`, {
      cause: outcome.error,
    });
  }

  return outcome.data;
}
