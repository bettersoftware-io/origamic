// What vitest's global setup does (globalSetup.mts): takes the lock on the
// test database, starts the test stack, checks that it is the test stack,
// and hands the tests where it answers and its keys.
//
// The variables are set before vitest starts its workers, which inherit them:
//
//   SUPABASE_URL                the API's address
//   SUPABASE_ANON_KEY           what the browser signs with
//   SUPABASE_SERVICE_ROLE_KEY   what a test signs with to act as the admin

import type { LocalSupabase } from "./cli.mts";
import { startLocalSupabase } from "./localSupabase.mts";
import { lockTestDatabase, type Release } from "./testDatabaseLock.mts";
import { testStackPorts } from "./testStack.mts";

/** The seams of opening the test database. Each has the real thing as its default. */
export interface TestDatabaseOptions {
  lock?: () => Promise<Release>;
  start?: () => Promise<LocalSupabase>;
  /** Where the variables are set. */
  environment?: NodeJS.ProcessEnv;
  /** The port the test stack's API is on. */
  apiPort?: number;
}

/**
 * Holds the lock, starts the test stack, and sets the variables the tests
 * read. Gives back what releases the lock; on a failure it is released at
 * once and nothing is set.
 */
export async function openTestDatabase({
  lock = lockTestDatabase,
  start = startLocalSupabase,
  environment = process.env,
  apiPort,
}: TestDatabaseOptions = {}): Promise<Release> {
  const release = await lock();

  try {
    const { url, anonKey, serviceRoleKey } = await start();
    const expected = apiPort ?? testStackPorts().api;
    const port = URL.parse(url)?.port;

    if (port !== String(expected)) {
      throw new Error(
        `The tests would run against ${url}, which is not the test stack (its API is on port ${String(expected)}). Nothing was set: a test there could write into the dev database.`,
      );
    }

    environment.SUPABASE_URL = url;
    environment.SUPABASE_ANON_KEY = anonKey;
    environment.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
  } catch (error) {
    release();

    throw error;
  }

  return release;
}
