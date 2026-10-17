// The test stack's project: a config made from the committed one, and this
// checkout's migrations, in a folder git ignores.
//
// The Supabase CLI reads `<workdir>/supabase/config.toml`, and names its
// containers and volumes after the `project_id` there. The committed config
// (`packages/adapters/supabase/config.toml`) is the dev stack's. The test
// stack's is that one with another `project_id` and every port the stack
// publishes moved by `PORT_OFFSET`, so the two never share data or a port.
// It is written again on each start, so it never drifts from the committed
// one, and nobody keeps a second config by hand.

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { PROJECT } from "./cli.mts";

/** The test stack's project id: its containers are `supabase_<service>_origamic-test`. */
export const TEST_PROJECT_ID = "origamic-test";

/** How far each of the test stack's ports is from the dev stack's: the API is on 54421. */
const PORT_OFFSET = 100;

/** The folder the test stack's `supabase/` is written to. Git ignores it. */
export const TEST_WORKDIR = join(PROJECT, ".supabase-test");

interface StackPort {
  section: string;
  key: string;
  /** The CLI's port when the config names none; none when the CLI then publishes nothing. */
  cliDefault?: number;
}

/**
 * Every port a local stack publishes, as the CLI's config names it. Those
 * with a default are published (when their service is on) whether the
 * config names them or not, so the test config always names them.
 */
const STACK_PORTS: StackPort[] = [
  { section: "api", key: "port", cliDefault: 54321 },
  { section: "db", key: "port", cliDefault: 54322 },
  { section: "db", key: "shadow_port", cliDefault: 54320 },
  { section: "db.pooler", key: "port", cliDefault: 54329 },
  { section: "studio", key: "port", cliDefault: 54323 },
  { section: "local_smtp", key: "port", cliDefault: 54324 },
  { section: "local_smtp", key: "smtp_port" },
  { section: "local_smtp", key: "pop3_port" },
  { section: "edge_runtime", key: "inspector_port", cliDefault: 8083 },
  { section: "analytics", key: "port", cliDefault: 54327 },
  { section: "analytics", key: "vector_port" },
];

/** The first lines of the test stack's config. */
const GENERATED = [
  "# The test stack's config, written on each test run by tools/supabase/testStack.mts",
  "# from packages/adapters/supabase/config.toml, with its own project_id and ports.",
  "# Edit that file, not this one.",
  "",
];

/** What the Supabase CLI writes for itself in a `supabase/` folder: never copied, never removed. */
const CLI_STATE = new Set([".temp", ".branches"]);

/** The seams of writing the test stack's project. */
export interface PrepareOptions {
  /** The committed `supabase/` folder. */
  source?: string;
  /** The folder the test stack's `supabase/` folder is written to. */
  workdir?: string;
}

/**
 * Writes the test stack's project: its config, from the committed one, and a
 * fresh copy of everything else in the committed `supabase/` folder (the
 * migrations above all), so it has exactly this checkout's. What an earlier
 * run wrote there is removed first, except what the CLI keeps for itself.
 * Gives the folder to run the CLI in.
 */
export function prepareTestStack({
  source = join(PROJECT, "supabase"),
  workdir = TEST_WORKDIR,
}: PrepareOptions = {}): string {
  const target = join(workdir, "supabase");

  mkdirSync(target, { recursive: true });

  for (const name of readdirSync(target)) {
    if (!CLI_STATE.has(name)) {
      rmSync(join(target, name), { recursive: true, force: true });
    }
  }

  cpSync(source, target, {
    recursive: true,
    filter: (from) => {
      return from === source || !(CLI_STATE.has(basename(from)) || from === join(source, "config.toml"));
    },
  });
  writeFileSync(join(target, "config.toml"), testStackConfig(readFileSync(join(source, "config.toml"), "utf8")));

  return workdir;
}

/** Where the test stack's API and database answer. */
export interface TestStackPorts {
  api: number;
  db: number;
}

/** The test stack's ports, as its config (made from the committed one) names them. */
export function testStackPorts(
  committed: string = readFileSync(join(PROJECT, "supabase", "config.toml"), "utf8"),
): TestStackPorts {
  const config = testStackConfig(committed);

  return { api: portIn(config, "api", "port"), db: portIn(config, "db", "port") };
}

/** The port at this key of this section of a TOML text. */
function portIn(config: string, wanted: string, key: string): number {
  let section = "";

  for (const line of config.split("\n")) {
    const header = /^\s*\[\[?([^\]]+)\]\]?\s*(#.*)?$/.exec(line);
    const setting = /^\s*(\w+)\s*=\s*(\d+)/.exec(line);

    if (header?.[1] !== undefined) {
      section = header[1].trim();
    } else if (section === wanted && setting?.[1] === key) {
      return Number(setting[2]);
    }
  }

  throw new Error(`The test stack's config names no ${key} under [${wanted}]`);
}

/** The committed config, as the test stack's: its own project id, and every port moved. */
export function testStackConfig(committed: string): string {
  const lines = committed.split("\n");
  const named = new Set<string>();
  let section = "";
  let hasProjectId = false;

  const moved = lines.map((line) => {
    const header = /^\s*\[\[?([^\]]+)\]\]?\s*(#.*)?$/.exec(line);

    if (header?.[1] !== undefined) {
      section = header[1].trim();

      return line;
    }

    if (section === "" && /^\s*project_id\s*=/.test(line)) {
      hasProjectId = true;

      return `project_id = "${TEST_PROJECT_ID}"`;
    }

    const setting = /^(\s*)(\w+)(\s*=\s*)(\d+)(.*)$/.exec(line);
    const port = setting === null ? undefined : stackPort(section, setting[2]);

    if (setting === null || port === undefined) {
      return line;
    }

    named.add(`${port.section}.${port.key}`);

    return `${setting[1] ?? ""}${port.key}${setting[3] ?? ""}${String(Number(setting[4]) + PORT_OFFSET)}${setting[5] ?? ""}`;
  });

  if (!hasProjectId) {
    throw new Error("The committed supabase/config.toml names no project_id, so the test stack's cannot be told apart from it");
  }

  return [...GENERATED, ...withDefaults(moved, named)].join("\n");
}

/** The stack's port at this key of this section, if it is one. */
function stackPort(section: string, key: string | undefined): StackPort | undefined {
  return STACK_PORTS.find((port) => {
    return port.section === section && port.key === key;
  });
}

/**
 * The lines with each port the config left to the CLI named, moved: right
 * under its section's header, or in a section added at the end.
 */
function withDefaults(lines: string[], named: Set<string>): string[] {
  const result = [...lines];

  for (const port of STACK_PORTS) {
    if (port.cliDefault === undefined || named.has(`${port.section}.${port.key}`)) {
      continue;
    }

    const setting = `${port.key} = ${String(port.cliDefault + PORT_OFFSET)}`;
    const header = result.findIndex((line) => {
      return /^\s*\[([^\]]+)\]\s*(#.*)?$/.exec(line)?.[1]?.trim() === port.section;
    });

    if (header === -1) {
      result.push("", `[${port.section}]`, setting);
    } else {
      result.splice(header + 1, 0, setting);
    }
  }

  return result;
}
