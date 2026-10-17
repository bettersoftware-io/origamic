// Running the Supabase CLI and Docker, and reading what they print. Used by
// localSupabase.mts for both local stacks.

import { spawn } from "node:child_process";
import { join } from "node:path";

/** The folder that holds the committed `supabase/`: the dev stack's config and the migrations. */
export const PROJECT = join(import.meta.dirname, "..", "..", "packages", "adapters");

/** The CLI, as the package installs it. */
const CLI = join(PROJECT, "node_modules", ".bin", "supabase");

/** Where a stack answers, and the two keys a client signs its requests with. */
export interface LocalSupabase {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface Finished {
  /** The exit code; `null` when the program could not be started at all. */
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the CLI with these arguments on one stack's project. Never rejects. */
export type SupabaseCommand = (supabaseArguments: string[]) => Promise<Finished>;

/** Runs a program to its end, in this environment. Never rejects. */
export type Runner = (
  command: string,
  commandArguments: string[],
  environment: NodeJS.ProcessEnv,
) => Promise<Finished>;

/**
 * The CLI, run on the project whose `supabase/` folder is in `workdir`.
 *
 * The CLI lets a variable override its config: `SUPABASE_PROJECT_ID`, and
 * `SUPABASE_API_PORT` and every other `SUPABASE_*_PORT`. One left in the
 * environment would point both stacks at the same project or port, so those
 * are not passed on.
 */
export function supabaseIn(
  workdir: string,
  runner: Runner = run,
  environment: NodeJS.ProcessEnv = process.env,
): SupabaseCommand {
  const childEnvironment = withoutStackOverrides(environment);

  return (supabaseArguments) => {
    return runner(CLI, [...supabaseArguments, "--workdir", workdir], childEnvironment);
  };
}

/** The environment without the variables that override which project or port the CLI uses. */
function withoutStackOverrides(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => {
      return name !== "SUPABASE_PROJECT_ID" && !/^SUPABASE_\w*PORT$/.test(name);
    }),
  );
}

/** How long `docker info` may take before Docker counts as not answering. */
const DOCKER_TIMEOUT_MS = 5000;

/**
 * True when the Docker daemon answers. `docker info` honours `DOCKER_HOST`
 * and the current context. A daemon that is still starting can leave it
 * waiting, so it is stopped after a few seconds and counts as not answering.
 */
export async function dockerAnswers(): Promise<boolean> {
  const { code } = await run("docker", ["info", "--format", "{{.ServerVersion}}"], process.env, DOCKER_TIMEOUT_MS);

  return code === 0;
}

/** The error a command that did not exit with 0 is reported with. */
export function failure(supabaseArguments: string[], finished: Finished): Error {
  return new Error(
    `\`supabase ${supabaseArguments.join(" ")}\` exited with ${String(finished.code)}:\n${finished.stderr}${finished.stdout}`,
  );
}

/** The address and keys in what `supabase status -o json` printed. */
export function readKeys(output: string): LocalSupabase {
  const status = readStatus(output);
  const url = field(status, "API_URL");
  const anonKey = field(status, "ANON_KEY");
  const serviceRoleKey = field(status, "SERVICE_ROLE_KEY");

  if (url === undefined || anonKey === undefined || serviceRoleKey === undefined) {
    throw new Error(`\`supabase status -o json\` gave no API_URL, ANON_KEY or SERVICE_ROLE_KEY:\n${output}`);
  }

  return { url, anonKey, serviceRoleKey };
}

/** The port of the database, in what `supabase status -o json` printed; `undefined` when it names none. */
export function readDatabasePort(output: string): number | undefined {
  const url = field(readStatus(output), "DB_URL");

  if (url === undefined) {
    return undefined;
  }

  const port = Number(URL.parse(url)?.port);

  return Number.isInteger(port) && port > 0 ? port : undefined;
}

function readStatus(output: string): unknown {
  // The CLI can print a notice before the JSON, such as a newer version.
  const start = output.indexOf("{");

  if (start === -1) {
    throw new Error(`\`supabase status -o json\` printed no JSON:\n${output}`);
  }

  return JSON.parse(output.slice(start));
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
function run(
  command: string,
  commandArguments: string[],
  environment: NodeJS.ProcessEnv,
  timeoutMs?: number,
): Promise<Finished> {
  return new Promise((resolve) => {
    const child = spawn(command, commandArguments, {
      env: environment,
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
