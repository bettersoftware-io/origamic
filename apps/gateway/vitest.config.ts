import { configDefaults, defineConfig } from "vitest/config";

import { portTestsToSkip } from "../../tools/arch/testing/portTests.mts";
import {
  SUPABASE_TESTS,
  supabaseTestsToSkip,
} from "../../tools/supabase/localSupabase.mts";

// The tests named *.port.test.ts open a real port: where a process may not
// listen (Codex's sandbox), they are left out with a line that says so. The
// ones named *.supabase.test.ts run against a local Supabase, in Docker:
// where Docker is not running they are left out with a line that says so,
// and the stack is not started. In CI neither is ever left out.
export default defineConfig(async () => {
  const skipped = [
    ...(await portTestsToSkip()),
    ...(await supabaseTestsToSkip()),
  ];

  return {
    test: {
      exclude: [...configDefaults.exclude, ...skipped],
      passWithNoTests: skipped.length > 0,
      globalSetup: skipped.includes(SUPABASE_TESTS)
        ? []
        : ["../../tools/supabase/globalSetup.mts"],
    },
  };
});
