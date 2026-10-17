// The two local Supabase stacks (ADR-0004), each with its own project id and
// ports, so they never share data:
//
// - **The test stack** (`origamic-test`, the API on 54421, Postgres on
//   54422): what the adapters' tests, and so `pnpm gate:full`, run against.
//   Its data is throwaway: each test makes its own users. Its config is made
//   from the committed one (testStack.mts). When its database holds a
//   migration this checkout lacks, or lacks one older than the last it holds,
//   `startLocalSupabase()` resets it to this checkout's migrations and says
//   so. Every checkout on the machine shares it, one test run at a time
//   (testDatabaseLock.mts).
// - **The dev stack** (`origamic`, the API on 54321, Postgres on 54322): the
//   committed `packages/adapters/supabase/config.toml`, for the author's own
//   use. `startDevSupabase()` (`pnpm supabase:dev`) starts it; nothing resets
//   it.
//
// The Supabase CLI is a dev dependency of `packages/adapters`, pinned like any
// other, and runs each stack in Docker.
//
// A test that needs the test stack is named `*.supabase.test.ts`. A package's
// vitest config leaves those files out where Docker is not running, with one
// line that says they were not run, and starts the stack where it is:
//
//   import { configDefaults, defineConfig } from "vitest/config";
//   import { supabaseTestsToSkip } from "../../tools/supabase/localSupabase.mts";
//
//   export default defineConfig(async () => {
//     const skipped = await supabaseTestsToSkip();
//
//     return {
//       test: {
//         exclude: [...configDefaults.exclude, ...skipped],
//         passWithNoTests: skipped.length > 0,
//         globalSetup: skipped.length > 0 ? [] : ["../../tools/supabase/globalSetup.mts"],
//       },
//     };
//   });
//
// Never in CI: there a test that cannot run is a failure, so the files are
// never left out and the global setup fails, saying Docker is needed. Such a
// package's `test` task is not cached either, or a run that left them out
// would be replayed where they can run.
//
// Both stacks are left running: starting one takes seconds once its images
// are pulled, and minutes the first time. `pnpm --filter @origamic/adapters
// supabase stop` stops the dev stack; add `--workdir .supabase-test` for the
// test stack.

import {
  dockerAnswers,
  type Finished,
  failure,
  type LocalSupabase,
  PROJECT,
  readKeys,
  type SupabaseCommand,
  supabaseIn,
} from "./cli.mts";
import { prepareTestStack } from "./testStack.mts";

export type { LocalSupabase } from "./cli.mts";

/** The files that need a local Supabase, as a glob from a package's folder. */
export const SUPABASE_TESTS = "**/*.supabase.test.ts";

export interface SupabaseTestsOptions {
  environment?: NodeJS.ProcessEnv;
  probe?: () => Promise<boolean>;
  say?: (line: string) => void;
}

/**
 * The test files to leave out of this run: those that need a local Supabase,
 * where Docker is not running. Empty where it is, and always empty in CI.
 */
export async function supabaseTestsToSkip({
  environment = process.env,
  probe = dockerAnswers,
  say = console.log,
}: SupabaseTestsOptions = {}): Promise<string[]> {
  if (environment.CI || (await probe())) {
    return [];
  }

  say("SKIP supabase — Docker is not running here; the tests against a local Supabase were not run");

  return [SUPABASE_TESTS];
}

/** The seams of starting a stack. Each has the real thing as its default. */
export interface StartOptions {
  /** The CLI, run on the stack's project. */
  supabase?: SupabaseCommand;
  /** Whether Docker answers. */
  probe?: () => Promise<boolean>;
  say?: (line: string) => void;
}

/**
 * The test stack, started if it is not up, with exactly this checkout's
 * migrations: applied, or, when its database does not match them, reset to
 * them. It is left running. Hold the lock on it (testDatabaseLock.mts) first.
 */
export async function startLocalSupabase({
  supabase,
  probe = dockerAnswers,
  say = console.log,
}: StartOptions = {}): Promise<LocalSupabase> {
  await requireDocker(probe);

  const cli = supabase ?? supabaseIn(prepareTestStack());

  await startIfDown(cli);

  const up = await cli(MIGRATION_UP);

  if (up.code !== 0) {
    const mismatch = migrationMismatch(up);

    if (mismatch === undefined) {
      throw failure(MIGRATION_UP, up);
    }

    await orThrow(cli, ["db", "reset", "--local"]);
    say(`Reset the test database to this checkout's migrations: ${mismatch.test}.`);
  }

  return readKeys((await orThrow(cli, STATUS)).stdout);
}

/**
 * The dev stack, started if it is not up, with this checkout's pending
 * migrations applied. It is left running, and never reset: when its database
 * holds a migration this checkout lacks, this fails and says what to do.
 */
export async function startDevSupabase({
  supabase = supabaseIn(PROJECT),
  probe = dockerAnswers,
}: StartOptions = {}): Promise<LocalSupabase> {
  await requireDocker(probe);
  await startIfDown(supabase);

  const up = await supabase(MIGRATION_UP);

  if (up.code !== 0) {
    const mismatch = migrationMismatch(up);

    if (mismatch === undefined) {
      throw failure(MIGRATION_UP, up);
    }

    throw new Error(
      `${mismatch.dev}, so \`supabase migration up\` refused. Nothing was reset: its data is yours. Check out a branch that has that migration, or, to drop the dev data and apply this checkout's migrations, run \`pnpm --filter @origamic/adapters supabase db reset --local\`.`,
    );
  }

  return readKeys((await orThrow(supabase, STATUS)).stdout);
}

const STATUS = ["status", "-o", "json"];

const MIGRATION_UP = ["migration", "up", "--local"];

async function requireDocker(probe: () => Promise<boolean>): Promise<void> {
  if (!(await probe())) {
    throw new Error(
      "A local Supabase needs Docker, and Docker does not answer here (`docker info` failed). Start Docker and run again. In CI the tests against it are never left out, so this is a failure there.",
    );
  }
}

async function startIfDown(supabase: SupabaseCommand): Promise<void> {
  if ((await supabase(STATUS)).code !== 0) {
    await orThrow(supabase, ["start"]);
  }
}

async function orThrow(supabase: SupabaseCommand, supabaseArguments: string[]): Promise<Finished> {
  const finished = await supabase(supabaseArguments);

  if (finished.code !== 0) {
    throw failure(supabaseArguments, finished);
  }

  return finished;
}

/** What does not match, said of the test database and of the dev database. */
interface Mismatch {
  test: string;
  dev: string;
}

/**
 * What does not match, when `migration up` refused because the database's
 * migrations and this checkout's disagree; `undefined` when it failed for
 * another reason, such as a migration that does not run.
 */
function migrationMismatch({ stdout, stderr }: Finished): Mismatch | undefined {
  const output = `${stderr}\n${stdout}`;

  if (output.includes("Remote migration versions not found")) {
    // The CLI suggests `supabase migration repair --status reverted <versions>`.
    const versions = /--status reverted ([\d ]+)/.exec(output)?.[1]?.trim().split(/\s+/).join(", ") ?? "a migration";

    return {
      test: `it held ${versions}, which this checkout lacks`,
      dev: `The dev database holds ${versions}, which this checkout lacks`,
    };
  }

  if (output.includes("inserted before the last migration")) {
    // The CLI lists them as paths, one a line, in its JSON form with `\n`
    // between them.
    const files = [...output.matchAll(/migrations\/([^\s\\/"]+\.sql)/g)].map((match) => {
      return match[1];
    });
    const older = files.length > 0 ? files.join(", ") : "a migration";

    return {
      test: `this checkout's ${older} comes before the last migration it held`,
      dev: `The dev database's last migration is newer than this checkout's ${older}`,
    };
  }

  return undefined;
}
