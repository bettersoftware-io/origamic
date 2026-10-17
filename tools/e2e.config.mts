import { type E2eConfig, OUT_DIR } from "./e2e/lib/config.mts";
import { openE2eTestDatabase } from "./supabase/e2eDatabase.mts";

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

    // The session, the ontology, the objects and the library on the local
    // test Supabase (`origamic-test`), never the dev one: the mode holds the
    // test database's lock for the run, as the adapters' tests do. It needs
    // Docker, which the Playwright container has not, so it runs on the host.
    stack: {
      host: true,
      env: openE2eTestDatabase,
    },
  },
};

export default config;
