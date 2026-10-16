import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { StoredObject } from "@origamic/core";
import type { Ontology } from "@origamic/spec";

import { type Adapters, createSupabaseAdapters } from "../index.ts";
import type { Database } from "../supabase/rows.ts";

/** One owner: a fresh user, signed in on adapters of their own. */
export interface Owner {
  id: string;
  email: string;
  password: string;
  adapters: Adapters;
}

/** An account made through the admin API, nobody signed in to it. */
interface Account {
  id: string;
  email: string;
  password: string;
}

/**
 * The users a test file makes against the local Supabase. Every e-mail is a
 * new UUID, so files and checkouts sharing the stack never meet. `remove`
 * deletes each user, and with them every row they own.
 */
export interface Owners {
  /** A new user, signed in on new adapters. */
  create: () => Promise<Owner>;
  /** An account with this e-mail and password, made through the admin API. */
  createAccount: (email: string, password: string) => Promise<Account>;
  /** Adapters signed in to nobody, as the browser starts. */
  createSignedOut: () => Adapters;
  /** Writes the owner's ontology as the service role, bypassing the store. */
  writeOntology: (owner: Owner, ontology: Ontology) => Promise<void>;
  /** Writes objects as the service role, with their ids, bypassing `planWrite`. */
  writeObjects: (
    owner: Owner,
    objects: readonly StoredObject[],
  ) => Promise<void>;
  /** The admin's client, which row-level security does not hold. */
  admin: SupabaseClient<Database>;
  /** Marks a user made elsewhere (by a sign-up) for removal. */
  track: (id: string) => void;
  remove: () => Promise<void>;
}

/** The users of one test file. Call `remove` once its tests are done. */
export function createOwners(): Owners {
  const admin = createClient<Database>(
    environment("SUPABASE_URL"),
    environment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const made: string[] = [];

  async function createAccount(
    email: string,
    password: string,
  ): Promise<Account> {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created.error) {
      throw created.error;
    }

    made.push(created.data.user.id);

    return { id: created.data.user.id, email, password };
  }

  return {
    admin,
    createAccount,
    createSignedOut: createSignedOutAdapters,
    create: async (): Promise<Owner> => {
      const account = await createAccount(
        `${crypto.randomUUID()}@origamic.test`,
        crypto.randomUUID(),
      );
      const adapters = createSignedOutAdapters();
      const signedIn = await adapters.session.signIn(
        account.email,
        account.password,
      );

      if (signedIn.kind !== "signedIn") {
        throw new Error(`a new user could not sign in: ${signedIn.message}`);
      }

      return { ...account, adapters };
    },
    writeOntology: async (owner: Owner, ontology: Ontology): Promise<void> => {
      const { error } = await admin.from("ontology_versions").insert({
        owner: owner.id,
        version: ontology.version,
        ontology,
      });

      if (error) {
        throw error;
      }
    },
    writeObjects: async (
      owner: Owner,
      objects: readonly StoredObject[],
    ): Promise<void> => {
      if (objects.length === 0) {
        return;
      }

      const { error } = await admin.from("objects").insert(
        objects.map((object) => {
          return {
            id: object.id,
            owner: owner.id,
            type: object.type,
            type_version: object.typeVersion,
            data: object.values,
          };
        }),
      );

      if (error) {
        throw error;
      }
    },
    track: (id: string): void => {
      made.push(id);
    },
    remove: async (): Promise<void> => {
      for (const id of made.splice(0)) {
        const { error } = await admin.auth.admin.deleteUser(id);

        if (error) {
          throw error;
        }
      }
    },
  };
}

function createSignedOutAdapters(): Adapters {
  return createSupabaseAdapters({
    url: environment("SUPABASE_URL"),
    anonKey: environment("SUPABASE_ANON_KEY"),
  });
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
