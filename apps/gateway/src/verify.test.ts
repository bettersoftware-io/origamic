import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

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

  it("rejects a 429, which says nothing of the token", async () => {
    answerWith(new Response("slow down", { status: 429 }));

    await expect(createVerifier()("a-token")).rejects.toThrow("429");
  });

  it("gives up on a Supabase that does not answer within its timeout", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.stubGlobal(
      "fetch",
      (_input: URL, init: RequestInit): Promise<Response> => {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        });
      },
    );
    let settled = false;

    const checked = createSupabaseVerifier({
      url: "http://supabase.test",
      anonKey: "anon",
      timeoutMs: 5000,
    })("a-token").finally(() => {
      settled = true;
    });

    checked.catch(() => {});
    await vi.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    await expect(checked).rejects.toThrow("did not answer within 5000 ms");
  });

  it("gives up on a body that stops arriving, the timeout still running while it is read", async () => {
    vi.useFakeTimers();
    onTestFinished(() => {
      vi.useRealTimers();
    });
    vi.stubGlobal(
      "fetch",
      (_input: URL, init: RequestInit): Promise<Response> => {
        const body = new ReadableStream<Uint8Array>({
          start(controller: ReadableStreamDefaultController<Uint8Array>): void {
            controller.enqueue(new TextEncoder().encode('{"id":'));
            init.signal?.addEventListener("abort", () => {
              controller.error(new Error("aborted"));
            });
          },
        });

        return Promise.resolve(new Response(body));
      },
    );

    const checked = createSupabaseVerifier({
      url: "http://supabase.test",
      anonKey: "anon",
      timeoutMs: 5000,
    })("a-token");

    checked.catch(() => {});
    await vi.advanceTimersByTimeAsync(5000);

    await expect(checked).rejects.toThrow("did not answer within 5000 ms");
  });

  it("rejects when Supabase cannot be reached", async () => {
    vi.stubGlobal("fetch", (): Promise<Response> => {
      return Promise.reject(new TypeError("fetch failed"));
    });

    await expect(createVerifier()("a-token")).rejects.toThrow("fetch failed");
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
