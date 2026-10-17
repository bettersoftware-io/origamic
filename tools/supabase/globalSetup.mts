// Vitest's global setup for a package with `*.supabase.test.ts` files: takes
// the lock on the test database, starts the test stack (or finds it running),
// brings its database to this checkout's migrations, and sets SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY for the tests. The lock is
// given back when the run ends. See testDatabase.mts and localSupabase.mts.

import { openTestDatabase } from "./testDatabase.mts";

export default function setup(): Promise<() => void> {
  return openTestDatabase();
}
