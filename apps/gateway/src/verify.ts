import { Id } from "@origamic/spec";

import type { Caller, VerifyCaller } from "./server.ts";

/** Where Supabase answers, the key a browser signs its requests with, and how long a token check may take (5 seconds when left out). */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Checks a caller's token by asking Supabase who it belongs to
 * (`GET /auth/v1/user`), so the gateway holds no signing secret. A token
 * Supabase refuses is refused. An issuer that fails, is rate-limited (429)
 * or does not answer in time is a rejection: the token could not be checked
 * either way.
 */
export function createSupabaseVerifier(config: SupabaseConfig): VerifyCaller {
  const endpoint = new URL("/auth/v1/user", config.url);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (token: string): Promise<Caller> => {
    const response = await within(timeoutMs, (signal) => {
      return fetch(endpoint, {
        headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
        signal,
      });
    });

    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Supabase answered ${response.status} to a token check`);
    }

    if (!response.ok) {
      return { kind: "refused" };
    }

    const id = Id.safeParse(ownField(await response.json(), "id"));

    return id.success ? { kind: "user", id: id.data } : { kind: "refused" };
  };
}

/** What `ask` answers, or a rejection once `timeoutMs` has passed, with the request aborted. */
async function within(
  timeoutMs: number,
  ask: (signal: AbortSignal) => Promise<Response>,
): Promise<Response> {
  const stop = new AbortController();
  const timer = setTimeout(() => {
    stop.abort();
  }, timeoutMs);

  try {
    return await ask(stop.signal);
  } catch (error) {
    throw stop.signal.aborted
      ? new Error(`Supabase did not answer within ${timeoutMs} ms`)
      : error;
  } finally {
    clearTimeout(timer);
  }
}

/** A field the value holds itself, never one it inherits. */
function ownField(value: unknown, key: string): unknown {
  return typeof value === "object" &&
    value !== null &&
    Object.hasOwn(value, key)
    ? Reflect.get(value, key)
    : undefined;
}
