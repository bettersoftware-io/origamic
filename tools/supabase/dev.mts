// `pnpm supabase:dev`: starts the dev stack (or finds it running), applies
// this checkout's pending migrations, and prints where it answers. Its data is
// the author's: nothing here resets it. See localSupabase.mts.

import { startDevSupabase } from "./localSupabase.mts";

try {
  const { url, anonKey } = await startDevSupabase();

  console.log(`The dev Supabase is up, with this checkout's migrations.\n  API       ${url}\n  anon key  ${anonKey}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
