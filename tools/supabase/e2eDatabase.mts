// The end-to-end tests' `stack` mode reaches the test database the way the
// adapters' tests do (testDatabase.mts): it takes the lock, starts the test
// stack, and checks that it is the test stack, never the dev one. The lock
// is held for the whole e2e run, and given back when the run's process ends,
// however it ends: a gate started meanwhile waits for it, and none waits on
// a lock this run forgot. (A run killed outright leaves a lock whose process
// is gone, which the next run takes over: testDatabaseLock.mts.)

import { openTestDatabase } from "./testDatabase.mts";
import type { Release } from "./testDatabaseLock.mts";

/** The seams of opening the test database for the e2e run. Each has the real thing as its default. */
export interface E2eDatabaseOptions {
  /** Takes the lock, starts the test stack, and sets its variables in `environment`. */
  open?: (environment: NodeJS.ProcessEnv) => Promise<Release>;
  /** Gives the lock back when the run ends. */
  releaseAtEnd?: (release: Release) => void;
}

/** The web app's variables for the test stack: its API and its anon key. No gateway: the model is scripted. */
export async function openE2eTestDatabase({
  open = openInto,
  releaseAtEnd = releaseAtExit,
}: E2eDatabaseOptions = {}): Promise<Record<string, string>> {
  const environment: NodeJS.ProcessEnv = {};
  const release = await open(environment);

  releaseAtEnd(release);

  const url = environment.SUPABASE_URL;
  const anonKey = environment.SUPABASE_ANON_KEY;

  if (url === undefined || anonKey === undefined) {
    throw new Error("The test database was opened without its address or its anon key.");
  }

  return { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey, VITE_GATEWAY_URL: "" };
}

function openInto(environment: NodeJS.ProcessEnv): Promise<Release> {
  return openTestDatabase({ environment });
}

/** On every way the run's process ends: its own exit, and the exit its signal handlers end in. The release is synchronous, as `exit` needs. */
function releaseAtExit(release: Release): void {
  process.once("exit", release);
}
