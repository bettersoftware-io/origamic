import { createClient } from "@supabase/supabase-js";

import type {
  ObjectStorePort,
  OntologyStorePort,
  SessionPort,
  SpecLibraryPort,
} from "@origamic/core";

import type { Database } from "./rows.ts";
import { createSupabaseObjectStore } from "./supabaseObjectStore.ts";
import { createSupabaseOntologyStore } from "./supabaseOntologyStore.ts";
import { createSupabaseSession } from "./supabaseSession.ts";
import { createSupabaseSpecLibrary } from "./supabaseSpecLibrary.ts";

/** Where the Supabase project answers, and the key the browser signs its requests with. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** The ports Supabase implements, over one client, and the token the gateway is called with. */
export interface Adapters {
  session: SessionPort;
  ontology: OntologyStorePort;
  objects: ObjectStorePort;
  library: SpecLibraryPort;
  /** The signed-in user's access token, or `null` signed out. */
  accessToken(): Promise<string | null>;
}

/**
 * The four ports on one Supabase client. Each store holds the rows of
 * whoever is signed in on `session`: the database fills in the owner, and
 * row-level security keeps every read and write to that owner's rows.
 */
export function createSupabaseAdapters(config: SupabaseConfig): Adapters {
  const client = createClient<Database>(config.url, config.anonKey);

  return {
    session: createSupabaseSession(client),
    ontology: createSupabaseOntologyStore(client),
    objects: createSupabaseObjectStore(client),
    library: createSupabaseSpecLibrary(client),
    accessToken: async (): Promise<string | null> => {
      const { data } = await client.auth.getSession();

      return data.session?.access_token ?? null;
    },
  };
}
