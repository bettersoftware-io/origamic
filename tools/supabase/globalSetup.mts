// Vitest's global setup for a package with `*.supabase.test.ts` files: starts
// the local Supabase (or finds it running), applies the migrations, and hands
// the tests where it answers and its keys. See localSupabase.mts.
//
// The variables are set before vitest starts its workers, which inherit them:
//
//   SUPABASE_URL                the API's address
//   SUPABASE_ANON_KEY           what the browser signs with
//   SUPABASE_SERVICE_ROLE_KEY   what a test signs with to act as the admin

import { startLocalSupabase } from "./localSupabase.mts";

export default async function setup(): Promise<void> {
  const { url, anonKey, serviceRoleKey } = await startLocalSupabase();

  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_ANON_KEY = anonKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
}
