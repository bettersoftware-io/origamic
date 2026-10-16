// The local Supabase the adapters' tests run against (ADR-0004).
//
// The Supabase CLI is a dev dependency of `packages/adapters`, pinned like any
// other, and its project is `packages/adapters/supabase/`: the config and the
// migrations. The CLI runs the stack in Docker.
//
// A test that needs it is named `*.supabase.test.ts`. A package's vitest
// config leaves those files out where Docker is not running, with one line
// that says they were not run, and starts the stack where it is:
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
// The stack is left running when the tests end: starting it takes seconds
// once its images are pulled, and minutes the first time. `pnpm --filter
// @origamic/adapters supabase stop` stops it.

import { spawn } from "node:child_process";
import { join } from "node:path";

/** The files that need a local Supabase, as a glob from a package's folder. */
export const SUPABASE_TESTS = "**/*.supabase.test.ts";

/** The folder that holds `supabase/`: its config and its migrations. */
const PROJECT = join(import.meta.dirname, "..", "..", "packages", "adapters");

/** The CLI, as the package installs it. */
const CLI = join(PROJECT, "node_modules", ".bin", "supabase");

/** Where the stack answers, and the two keys a client signs its requests with. */
export interface LocalSupabase {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

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

/**
 * The local Supabase, started if it is not up, with every migration applied.
 * It is left running.
 */
export async function startLocalSupabase(): Promise<LocalSupabase> {
  if (!(await dockerAnswers())) {
    throw new Error(
      "A local Supabase needs Docker, and Docker does not answer here (`docker info` failed). Start Docker and run again. In CI the tests against it are never left out, so this is a failure there.",
    );
  }

  if ((await supabase(["status", "-o", "json"])).code !== 0) {
    await supabaseOrThrow(["start"]);
  }

  await supabaseOrThrow(["migration", "up", "--local"]);

  return readKeys((await supabaseOrThrow(["status", "-o", "json"])).stdout);
}

/** How long `docker info` may take before Docker counts as not answering. */
const DOCKER_TIMEOUT_MS = 5000;

/**
 * True when the Docker daemon answers. `docker info` honours `DOCKER_HOST`
 * and the current context. A daemon that is still starting can leave it
 * waiting, so it is stopped after a few seconds and counts as not answering.
 */
async function dockerAnswers(): Promise<boolean> {
  const { code } = await run("docker", ["info", "--format", "{{.ServerVersion}}"], DOCKER_TIMEOUT_MS);

  return code === 0;
}

interface Finished {
  /** The exit code; `null` when the program could not be started at all. */
  code: number | null;
  stdout: string;
  stderr: string;
}

function supabase(supabaseArguments: string[]): Promise<Finished> {
  return run(CLI, [...supabaseArguments, "--workdir", PROJECT]);
}

async function supabaseOrThrow(supabaseArguments: string[]): Promise<Finished> {
  const finished = await supabase(supabaseArguments);

  if (finished.code !== 0) {
    throw new Error(
      `\`supabase ${supabaseArguments.join(" ")}\` exited with ${String(finished.code)}:\n${finished.stderr}${finished.stdout}`,
    );
  }

  return finished;
}

function readKeys(output: string): LocalSupabase {
  // The CLI can print a notice before the JSON, such as a newer version.
  const start = output.indexOf("{");

  if (start === -1) {
    throw new Error(`\`supabase status -o json\` printed no JSON:\n${output}`);
  }

  const status: unknown = JSON.parse(output.slice(start));
  const url = field(status, "API_URL");
  const anonKey = field(status, "ANON_KEY");
  const serviceRoleKey = field(status, "SERVICE_ROLE_KEY");

  if (url === undefined || anonKey === undefined || serviceRoleKey === undefined) {
    throw new Error(`\`supabase status -o json\` gave no API_URL, ANON_KEY or SERVICE_ROLE_KEY:\n${output}`);
  }

  return { url, anonKey, serviceRoleKey };
}

/** The string `value` holds under `name`, if it is an object that holds one. */
function field(value: unknown, name: string): string | undefined {
  if (typeof value !== "object" || value === null || !(name in value)) {
    return undefined;
  }

  const found: unknown = Reflect.get(value, name);

  return typeof found === "string" ? found : undefined;
}

/**
 * Runs a program to its end and collects what it printed. Never rejects.
 *
 * With a timeout, a program still running then is killed with everything it
 * started, and the answer is given at once with the code `null`: waiting for
 * its output to close could wait on a child it left behind. So it runs in a
 * process group of its own, which is what is killed.
 */
function run(command: string, commandArguments: string[], timeoutMs?: number): Promise<Finished> {
  return new Promise((resolve) => {
    const child = spawn(command, commandArguments, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: timeoutMs !== undefined,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    function settle(finished: Finished): void {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(finished);
      }
    }

    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            killGroup(child.pid);
            child.stdout.destroy();
            child.stderr.destroy();
            settle({ code: null, stdout, stderr: `${stderr}\`${command}\` gave no answer within ${String(timeoutMs)} ms` });
          }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      settle({ code: null, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code) => {
      settle({ code, stdout, stderr });
    });
  });
}

/** Kills a process group led by `pid`, if it is still there. */
function killGroup(pid: number | undefined): void {
  if (pid === undefined) {
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // It ended on its own in the meantime.
  }
}
