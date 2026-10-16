import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSupabaseVerifier } from "./verify.ts";

// The verifier against the local Supabase the global setup starts: a user
// made afresh through the admin API, signed in with a password as the
// browser signs in.
describe("the Supabase verifier", () => {
  beforeAll(async () => {
    user = await createSignedInUser();
  });

  afterAll(async () => {
    await user.remove();
  });

  it("a fresh user's token is that user", async () => {
    const verify = createVerifier();

    expect(await verify(user.accessToken)).toEqual({
      kind: "user",
      id: user.id,
    });
  });

  it("a made-up token is refused", async () => {
    const verify = createVerifier();

    expect(await verify("made-up")).toEqual({ kind: "refused" });
  });

  let user: SignedInUser;
});

interface SignedInUser {
  id: string;
  accessToken: string;
  /** Deletes the user. */
  remove: () => Promise<void>;
}

function createVerifier(): ReturnType<typeof createSupabaseVerifier> {
  return createSupabaseVerifier({
    url: environment("SUPABASE_URL"),
    anonKey: environment("SUPABASE_ANON_KEY"),
  });
}

/** A user with a fresh e-mail, made by the admin and signed in with a password. */
async function createSignedInUser(): Promise<SignedInUser> {
  const url = environment("SUPABASE_URL");
  const serviceRoleKey = environment("SUPABASE_SERVICE_ROLE_KEY");
  const admin = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const email = `${crypto.randomUUID()}@origamic.test`;
  const password = crypto.randomUUID();
  const created = await answerOf(
    fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ email, password, email_confirm: true }),
    }),
  );
  const id = stringAt(created, "id");
  const session = await answerOf(
    fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: environment("SUPABASE_ANON_KEY"),
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    }),
  );

  return {
    id,
    accessToken: stringAt(session, "access_token"),
    remove: async () => {
      await answerOf(
        fetch(`${url}/auth/v1/admin/users/${id}`, {
          method: "DELETE",
          headers: admin,
        }),
      );
    },
  };
}

async function answerOf(pending: Promise<Response>): Promise<unknown> {
  const response = await pending;

  if (!response.ok) {
    throw new Error(
      `Supabase answered ${response.status}: ${await response.text()}`,
    );
  }

  const body: unknown = await response.json();

  return body;
}

function stringAt(value: unknown, key: string): string {
  const found: unknown =
    typeof value === "object" && value !== null && Object.hasOwn(value, key)
      ? Reflect.get(value, key)
      : undefined;

  if (typeof found !== "string") {
    throw new Error(`Supabase's answer has no "${key}"`);
  }

  return found;
}

function environment(name: string): string {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`${name} is not set; the global setup sets it`);
  }

  return value;
}
