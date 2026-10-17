import { describe, expect, it } from "vitest";

// biome-ignore-start lint/style/noRestrictedImports: the tool is in tools/, outside every package, where no #/ alias reaches; this test holds its rule because tools/ has no test runner
import {
  type Finished,
  PROJECT,
  supabaseIn,
} from "../../../tools/supabase/cli.mts";
import {
  type StartOptions,
  startDevSupabase,
  startLocalSupabase,
} from "../../../tools/supabase/localSupabase.mts";
import { TEST_WORKDIR } from "../../../tools/supabase/testStack.mts";

// biome-ignore-end lint/style/noRestrictedImports: the imports above

// How the two local stacks are started. The test stack's data is throwaway,
// so a database whose migrations do not match this checkout is reset; the dev
// stack's data is the author's, so it never is. What runs the CLI is given:
// each test says what each command answers, and reads back what was run and
// on which project.
describe("starting the test stack", () => {
  it("runs every command on the test stack's generated project, never on the committed one", async () => {
    const cli = createCli({
      status: [UP, UP, UP],
      migrationUp: [missingLocally("20261016120000")],
    });

    await startLocalSupabase(cli.options);

    expect(cli.workdirs.length).toBe(cli.ran.length);
    expect(new Set(cli.workdirs)).toEqual(new Set([TEST_WORKDIR]));
  });

  it("refuses to reset a stack whose database is not on the test stack's port", async () => {
    const cli = createCli({
      status: [UP, DEV_UP],
      migrationUp: [missingLocally("20261016120000")],
    });

    await expect(startLocalSupabase(cli.options)).rejects.toThrow(
      "Refused to reset the database: the stack these commands reach has it on port 54322, not on the test stack's 54422. Nothing was reset.",
    );
    expect(cli.ran).not.toContain("db reset --local");
    expect(cli.said).toEqual([]);
  });

  it("starts it when it is not up, applies the migrations, and gives its address and keys", async () => {
    const cli = createCli({ status: [DOWN, UP] });

    const supabase = await startLocalSupabase(cli.options);

    expect(supabase).toEqual(KEYS);
    expect(cli.ran).toEqual([
      "status -o json",
      "start",
      "migration up --local",
      "status -o json",
    ]);
  });

  it("does not start it when it is up", async () => {
    const cli = createCli({ status: [UP, UP] });

    await startLocalSupabase(cli.options);

    expect(cli.ran).toEqual([
      "status -o json",
      "migration up --local",
      "status -o json",
    ]);
  });

  it("resets it when it holds a migration this checkout lacks, and says which", async () => {
    const cli = createCli({
      status: [UP, UP, UP],
      migrationUp: [missingLocally("20261016120000 20261017000000")],
    });

    const supabase = await startLocalSupabase(cli.options);

    expect(supabase).toEqual(KEYS);
    expect(cli.ran).toEqual([
      "status -o json",
      "migration up --local",
      "status -o json",
      "db reset --local",
      "status -o json",
    ]);
    expect(cli.said).toEqual([
      "Reset the test database to this checkout's migrations: it held 20261016120000, 20261017000000, which this checkout lacks.",
    ]);
  });

  it("reads which migration from the CLI's JSON form, as it answers an agent", async () => {
    const cli = createCli({
      status: [UP, UP, UP],
      migrationUp: [asJson(missingLocally("20261017090000"))],
    });

    await startLocalSupabase(cli.options);

    expect(cli.said).toEqual([
      "Reset the test database to this checkout's migrations: it held 20261017090000, which this checkout lacks.",
    ]);
  });

  it("resets it when this checkout has a migration older than the last one it holds", async () => {
    const cli = createCli({
      status: [UP, UP, UP],
      migrationUp: [insertedBefore("20261016000000_objects_and_specs.sql")],
    });

    await startLocalSupabase(cli.options);

    expect(cli.ran).toContain("db reset --local");
    expect(cli.said).toEqual([
      "Reset the test database to this checkout's migrations: this checkout's 20261016000000_objects_and_specs.sql comes before the last migration it held.",
    ]);
  });

  it("names each older migration from the CLI's JSON form", async () => {
    const cli = createCli({
      status: [UP, UP, UP],
      migrationUp: [
        asJson(
          insertedBefore(
            "20261016000000_objects_and_specs.sql",
            "20261016500000_older.sql",
          ),
        ),
      ],
    });

    await startLocalSupabase(cli.options);

    expect(cli.said).toEqual([
      "Reset the test database to this checkout's migrations: this checkout's 20261016000000_objects_and_specs.sql, 20261016500000_older.sql comes before the last migration it held.",
    ]);
  });

  it("fails, and resets nothing, when a migration itself fails", async () => {
    const cli = createCli({
      status: [UP],
      migrationUp: [failed('ERROR: syntax error at or near "tabel"')],
    });

    await expect(startLocalSupabase(cli.options)).rejects.toThrow(
      'syntax error at or near "tabel"',
    );
    expect(cli.ran).not.toContain("db reset --local");
  });

  it("fails, and says why, when the reset fails", async () => {
    const cli = createCli({
      status: [UP, UP],
      migrationUp: [missingLocally("20261016120000")],
      dbReset: [failed('ERROR: relation "objects" already exists')],
    });

    await expect(startLocalSupabase(cli.options)).rejects.toThrow(
      "`supabase db reset --local` exited with 1",
    );
  });

  it("fails, and says Docker is needed, where Docker does not answer", async () => {
    const cli = createCli({ docker: false });

    await expect(startLocalSupabase(cli.options)).rejects.toThrow(
      "A local Supabase needs Docker",
    );
    expect(cli.ran).toEqual([]);
  });
});

describe("starting the dev stack", () => {
  it("starts it when it is not up, applies the migrations, and gives its address and keys", async () => {
    const cli = createCli({ status: [DOWN, UP] });

    const supabase = await startDevSupabase(cli.options);

    expect(supabase).toEqual(KEYS);
    expect(cli.ran).toEqual([
      "status -o json",
      "start",
      "migration up --local",
      "status -o json",
    ]);
  });

  it("never resets it: on a migration this checkout lacks it fails, and says what to do", async () => {
    const cli = createCli({
      status: [UP],
      migrationUp: [missingLocally("20261016120000")],
    });

    await expect(startDevSupabase(cli.options)).rejects.toThrow(
      "The dev database holds 20261016120000, which this checkout lacks, so `supabase migration up` refused. Nothing was reset: the dev data is yours. Check out a branch that has that migration, or, to drop the dev data and apply this checkout's migrations, run `pnpm --filter @origamic/adapters supabase db reset --local`.",
    );
    expect(cli.ran).not.toContain("db reset --local");
  });

  it("never resets it: on a migration older than its last it fails, and offers the fix that keeps the data", async () => {
    const cli = createCli({
      status: [DEV_UP],
      migrationUp: [insertedBefore("20261016500000_older.sql")],
    });

    await expect(startDevSupabase(cli.options)).rejects.toThrow(
      "The dev database's last migration is newer than this checkout's 20261016500000_older.sql, so `supabase migration up` refused. Nothing was reset: the dev data is yours. To apply it as well and keep the dev data, run `pnpm --filter @origamic/adapters supabase migration up --local --include-all`.",
    );
    expect(cli.ran).not.toContain("db reset --local");
  });

  it("runs every command on the committed project", async () => {
    const cli = createCli({ status: [DOWN, DEV_UP] });

    await startDevSupabase(cli.options);

    expect(new Set(cli.workdirs)).toEqual(new Set([PROJECT]));
  });
});

describe("running the CLI", () => {
  it("does not pass on a variable that would override the project or a port", async () => {
    const given: NodeJS.ProcessEnv[] = [];
    const supabase = supabaseIn(
      "/work",
      (_command, _arguments, environment) => {
        given.push(environment);

        return Promise.resolve(DONE);
      },
      {
        PATH: "/bin",
        SUPABASE_URL: "http://127.0.0.1:54421",
        SUPABASE_PROJECT_ID: "origamic",
        SUPABASE_API_PORT: "54321",
        SUPABASE_DB_PORT: "54322",
        SUPABASE_DB_SHADOW_PORT: "54320",
      },
    );

    await supabase(["status"]);

    expect(given).toEqual([
      { PATH: "/bin", SUPABASE_URL: "http://127.0.0.1:54421" },
    ]);
  });
});

const KEYS = {
  url: "http://127.0.0.1:54421",
  anonKey: "anon",
  serviceRoleKey: "service",
};

/** What `supabase status -o json` answers when the test stack is up, after a notice as the CLI can print. */
const UP: Answer = {
  code: 0,
  stdout: `A new version of Supabase CLI is available\n${JSON.stringify({ API_URL: KEYS.url, DB_URL: "postgresql://postgres:postgres@127.0.0.1:54422/postgres", ANON_KEY: "anon", SERVICE_ROLE_KEY: "service" })}`,
  stderr: "",
};

/** What `supabase status -o json` answers when the dev stack is up. */
const DEV_UP: Answer = {
  code: 0,
  stdout: JSON.stringify({
    API_URL: "http://127.0.0.1:54321",
    DB_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ANON_KEY: "anon",
    SERVICE_ROLE_KEY: "service",
  }),
  stderr: "",
};

const DOWN: Answer = {
  code: 1,
  stdout: "",
  stderr: "failed to inspect container health",
};

const DONE: Answer = { code: 0, stdout: "", stderr: "" };

type Answer = Finished;

interface Script {
  docker?: boolean;
  status?: Answer[];
  migrationUp?: Answer[];
  dbReset?: Answer[];
}

interface Cli {
  options: StartOptions;
  /** Each command run, without `supabase` and the workdir. */
  ran: string[];
  /** The workdir of each command run. */
  workdirs: string[];
  said: string[];
}

/** A CLI that answers each command from the script, in turn, and `DONE` once the script runs out. */
function createCli({
  docker = true,
  status = [],
  migrationUp = [],
  dbReset = [],
}: Script): Cli {
  const ran: string[] = [];
  const workdirs: string[] = [];
  const said: string[] = [];
  const answers: Record<string, Answer[]> = {
    "status -o json": [...status],
    "migration up --local": [...migrationUp],
    "db reset --local": [...dbReset],
  };

  return {
    ran,
    workdirs,
    said,
    options: {
      probe: () => {
        return Promise.resolve(docker);
      },
      say: (line: string) => {
        said.push(line);
      },
      run: (_cli: string, commandArguments: string[]) => {
        const at = commandArguments.indexOf("--workdir");
        const command = commandArguments.slice(0, at).join(" ");
        ran.push(command);
        workdirs.push(commandArguments[at + 1] ?? "");

        return Promise.resolve(answers[command]?.shift() ?? DONE);
      },
    },
  };
}

/** What `migration up` (CLI 2.121) prints when the database holds versions the migrations folder lacks. */
function missingLocally(versions: string): Answer {
  return failed(
    `Connecting to local database...\nRemote migration versions not found in local migrations directory.\n\nMake sure your local git repo is up-to-date. If the error persists, try repairing the migration history table:\nsupabase migration repair --local --status reverted ${versions}\n\nAnd update local migrations to match remote database:\nsupabase db pull --local\n`,
  );
}

/** What `migration up` (CLI 2.121) prints when migrations of this checkout are older than the database's last. */
function insertedBefore(...files: string[]): Answer {
  const paths = files.map((file) => {
    return `/work/supabase/migrations/${file}\n`;
  });

  return failed(
    `Connecting to local database...\nFound local migration files to be inserted before the last migration on remote database.\n\nRerun the command with --include-all flag to apply these migrations:\n${paths.join("")}`,
  );
}

/**
 * The same refusal as the CLI prints it when it runs under an agent: one line
 * of JSON, the message and the suggestion after it as JSON strings.
 */
function asJson(answer: Answer): Answer {
  const [connecting = "", message = "", ...suggestion] =
    answer.stderr.split("\n");

  const error = {
    code: "MigrationError",
    message,
    suggestion: suggestion.join("\n"),
  };

  return {
    ...answer,
    stderr: `${connecting}\n${JSON.stringify({ _tag: "Error", error })}\n`,
  };
}

function failed(stderr: string): Answer {
  return { code: 1, stdout: "", stderr };
}
