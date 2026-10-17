// Vitest's global setup for a package with `*.supabase.test.ts` files: takes
// the lock on the test database, starts the test stack (or finds it running),
// brings its database to this checkout's migrations, and hands the tests
// where it answers and its keys. The lock is given back when the run ends.
// See localSupabase.mts.
//
// The variables are set before vitest starts its workers, which inherit them:
//
//   SUPABASE_URL                the API's address
//   SUPABASE_ANON_KEY           what the browser signs with
//   SUPABASE_SERVICE_ROLE_KEY   what a test signs with to act as the admin

import { startLocalSupabase } from "./localSupabase.mts";
import { lockTestDatabase } from "./testDatabaseLock.mts";

export default async function setup(): Promise<() => void> {
  const release = await lockTestDatabase();

  try {
    const { url, anonKey, serviceRoleKey } = await startLocalSupabase();

    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_ANON_KEY = anonKey;
    process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  } catch (error) {
    release();

    throw error;
  }

  return release;
}
