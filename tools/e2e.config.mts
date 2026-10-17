import { type E2eConfig, OUT_DIR } from "./e2e/lib/config.mts";
import { startLocalSupabase } from "./supabase/localSupabase.mts";

// What `pnpm e2e` builds, starts and runs. This file is the project's: add a
// mode, or change a command, here. The runner is in tools/e2e and belongs to
// the add-on.
//
// A command is the program and its arguments, never `pnpm …`: a package
// manager's wrapper can die on the stop signal while the server it started
// lives on. Every address is printed by the program that owns it and read
// from its `ready` line, so no port is written down here.
//
// Both modes run Origamic's web app (apps/web) with the model scripted: no
// gateway is started, so the app's LLM port is the simulator on its dev
// script (apps/web/src/app/devScript.ts). The real model is asked outside the
// gate (ADR-0011).
const config: E2eConfig = {
  // The package that holds the specs. The specs of a mode are in src/<mode>/.
  tests: "packages/e2e",

  client: {
    cwd: "apps/web",
    // A production build, not the dev server: it is what ships, and a page
    // loads as a few files instead of one request for each module.
    build: ["node_modules/.bin/vite", "build", "--outDir", OUT_DIR, "--emptyOutDir"],
    // Vite takes the next free port when its own is taken, and prints the one it got.
    serve: ["node_modules/.bin/vite", "preview", "--outDir", OUT_DIR, "--host", "127.0.0.1"],
    ready: /Local:\s+(http:\/\/[^\s/]+)/,
  },

  modes: {
    // Every port a simulator (the plan's decision 8). Each variable is set to
    // nothing so that one left in the shell cannot turn this into the other
    // mode.
    sim: {
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", VITE_GATEWAY_URL: "" },
    },

    // The session, the ontology, the objects and the library on a local
    // Supabase, which needs Docker: the Playwright container has none, so the
    // mode runs on the host. Its address and key are read from the running
    // stack, which is started (or found running) with every migration applied.
    stack: {
      host: true,
      env: async (): Promise<Record<string, string>> => {
        const { url, anonKey } = await startLocalSupabase();

        return { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anonKey, VITE_GATEWAY_URL: "" };
      },
    },
  },
};

export default config;
