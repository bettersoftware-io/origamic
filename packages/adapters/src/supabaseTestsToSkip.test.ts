import { describe, expect, it } from "vitest";

// biome-ignore lint/style/noRestrictedImports: the tool is in tools/, outside every package, where no #/ alias reaches; this test holds its rule because tools/ has no test runner
import { supabaseTestsToSkip } from "../../../tools/supabase/localSupabase.mts";

// What this package's vitest config leaves out, decided by
// tools/supabase/localSupabase.mts. The tool has no test runner of its own,
// so its rule is held here, where the gate runs it. Docker is never asked:
// the probe is given.
describe("which tests against a local Supabase are left out", () => {
  it("leaves none out in CI, even where Docker does not answer", async () => {
    const said: string[] = [];

    const skipped = await supabaseTestsToSkip(
      createOptions({ CI: "true" }, false, said),
    );

    expect(skipped).toEqual([]);
    expect(said).toEqual([]);
  });

  it("leaves them out, and says so once, where Docker does not answer", async () => {
    const said: string[] = [];

    const skipped = await supabaseTestsToSkip(createOptions({}, false, said));

    expect(skipped).toEqual(["**/*.supabase.test.ts"]);
    expect(said).toEqual([
      "SKIP supabase — Docker is not running here; the tests against a local Supabase were not run",
    ]);
  });

  it("leaves none out where Docker answers", async () => {
    const said: string[] = [];

    const skipped = await supabaseTestsToSkip(createOptions({}, true, said));

    expect(skipped).toEqual([]);
    expect(said).toEqual([]);
  });
});

interface Options {
  environment: NodeJS.ProcessEnv;
  probe: () => Promise<boolean>;
  say: (line: string) => void;
}

/** The tool's seams: this environment, a Docker that answers or not, and a record of what it says. */
function createOptions(
  environment: NodeJS.ProcessEnv,
  dockerAnswers: boolean,
  said: string[],
): Options {
  return {
    environment,
    probe: () => {
      return Promise.resolve(dockerAnswers);
    },
    say: (line: string) => {
      said.push(line);
    },
  };
}
