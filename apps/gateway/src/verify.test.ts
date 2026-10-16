import { afterEach, describe, expect, it, vi } from "vitest";

import { createSupabaseVerifier } from "./verify.ts";

// What a live Supabase does not show on demand: an issuer that fails, and an
// answer without the user's id. `verify.supabase.test.ts` holds the rest.
describe("the Supabase verifier, on answers a live Supabase does not give", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for the token's user with the anonymous key", async () => {
    const seen = answerWith(new Response(JSON.stringify({ id: "u1" })));

    await createVerifier()("a-token");

    expect(seen).toEqual([
      {
        url: "http://supabase.test/auth/v1/user",
        apikey: "anon",
        authorization: "Bearer a-token",
      },
    ]);
  });

  it("rejects when the issuer fails, since the token could not be checked", async () => {
    answerWith(new Response("down", { status: 503 }));

    await expect(createVerifier()("a-token")).rejects.toThrow("503");
  });

  it("refuses an answer that names no user", async () => {
    answerWith(new Response(JSON.stringify({ email: "x@y.z" })));

    expect(await createVerifier()("a-token")).toEqual({ kind: "refused" });
  });
});

interface Seen {
  url: string;
  apikey: string | null;
  authorization: string | null;
}

function createVerifier(): ReturnType<typeof createSupabaseVerifier> {
  return createSupabaseVerifier({
    url: "http://supabase.test",
    anonKey: "anon",
  });
}

/** Stands in for `fetch` with one answer, and records what was asked. */
function answerWith(answer: Response): Seen[] {
  const seen: Seen[] = [];

  vi.stubGlobal("fetch", (input: URL, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);

    seen.push({
      url: input.toString(),
      apikey: headers.get("apikey"),
      authorization: headers.get("authorization"),
    });

    return Promise.resolve(answer);
  });

  return seen;
}
