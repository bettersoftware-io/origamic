import { configDefaults, defineConfig } from "vitest/config";

import { supabaseTestsToSkip } from "../../tools/supabase/localSupabase.mts";

// The tests named *.supabase.test.ts run against a local Supabase, in Docker.
// Where Docker is not running they are left out with a line that says so, and
// the stack is not started. In CI they always run.
export default defineConfig(async () => {
  const skipped = await supabaseTestsToSkip();

  return {
    test: {
      exclude: [...configDefaults.exclude, ...skipped],
      passWithNoTests: skipped.length > 0,
      globalSetup:
        skipped.length > 0 ? [] : ["../../tools/supabase/globalSetup.mts"],
    },
  };
});
