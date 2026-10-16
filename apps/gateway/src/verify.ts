import { Id } from "@origamic/spec";

import type { Caller, VerifyCaller } from "./server.ts";

/** Where Supabase answers, and the key a browser signs its requests with. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * Checks a caller's token by asking Supabase who it belongs to
 * (`GET /auth/v1/user`), so the gateway holds no signing secret. A token
 * Supabase refuses is refused; an issuer that fails is a rejection, since
 * the token could not be checked either way.
 */
export function createSupabaseVerifier(config: SupabaseConfig): VerifyCaller {
  const endpoint = new URL("/auth/v1/user", config.url);

  return async (token: string): Promise<Caller> => {
    const response = await fetch(endpoint, {
      headers: { apikey: config.anonKey, authorization: `Bearer ${token}` },
    });

    if (response.status >= 500) {
      throw new Error(`Supabase answered ${response.status} to a token check`);
    }

    if (!response.ok) {
      return { kind: "refused" };
    }

    const id = Id.safeParse(ownField(await response.json(), "id"));

    return id.success ? { kind: "user", id: id.data } : { kind: "refused" };
  };
}

/** A field the value holds itself, never one it inherits. */
function ownField(value: unknown, key: string): unknown {
  return typeof value === "object" &&
    value !== null &&
    Object.hasOwn(value, key)
    ? Reflect.get(value, key)
    : undefined;
}
