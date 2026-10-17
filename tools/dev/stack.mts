#!/usr/bin/env node
// `pnpm dev:stack`: the web app against a local Supabase and the gateway,
// for the first slice's loop on this machine (FIRST-SLICE.md).
//
//   ANTHROPIC_API_KEY=… pnpm dev:stack
//
// It starts the local Supabase (or finds it running) with every migration
// applied, then the gateway with the key, then the web app's dev server
// against both, and prints where each answers. Without ANTHROPIC_API_KEY the
// gateway is not started and the model is the dev script's (the app's
// src/app/devScript.ts), which is what the end-to-end tests' `stack` mode
// runs. Ctrl-C stops the gateway and the app; the local Supabase is left
// running, as the tests leave it (`pnpm --filter @origamic/adapters supabase
// stop` stops it).
//
// On a clean database: `pnpm --filter @origamic/adapters supabase db reset
// --local` first. Every checkout on the machine shares the one local
// Supabase (docs/STATUS.md, "Known limits").

import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";

import { startLocalSupabase } from "../supabase/localSupabase.mts";

const ROOT = join(import.meta.dirname, "..", "..");
/** The web app's address: the gateway lets only this origin call it. */
const APP_PORT = "5173";
const APP_URL = `http://localhost:${APP_PORT}`;
const GATEWAY_PORT = "8787";
const GATEWAY_URL = `http://localhost:${GATEWAY_PORT}`;

const children: ChildProcess[] = [];

function start(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  // Its own process group, so that stopping it stops what it started too.
  const child = spawn(command, args, { cwd, env, stdio: "inherit", detached: true });

  children.push(child);
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`[dev:stack] ${command} ${args.join(" ")} stopped (${signal ?? String(code)}); stopping the rest`);
      stopAll(1);
    }
  });
}

let stopping = false;

/** Signals every group still running. Each runs detached, in a group of its own, so nothing else stops it: this is called on every way out. */
function signalAll(signal: NodeJS.Signals): void {
  for (const child of children) {
    if (child.pid !== undefined && child.exitCode === null) {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // It ended on its own in the meantime.
      }
    }
  }
}

function stopAll(exitCode: number): void {
  stopping = true;
  signalAll("SIGTERM");
  process.exitCode = exitCode;
}

// Ctrl-C, a kill, and the terminal closing; and, whatever ends this
// process (an error included), what it started does not outlive it.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    stopAll(0);
  });
}

process.on("exit", () => {
  stopping = true;
  signalAll("SIGTERM");
});

console.log("[dev:stack] starting the local Supabase (the first start pulls its images, which takes minutes)");

const supabase = await startLocalSupabase();
const key = process.env.ANTHROPIC_API_KEY ?? "";

if (key === "") {
  console.log("[dev:stack] ANTHROPIC_API_KEY is not set: the gateway is not started, and the model is the dev script's");
} else {
  start("node", ["src/main.ts"], join(ROOT, "apps", "gateway"), {
    ...process.env,
    SUPABASE_URL: supabase.url,
    SUPABASE_ANON_KEY: supabase.anonKey,
    GATEWAY_ALLOWED_ORIGIN: APP_URL,
    PORT: GATEWAY_PORT,
  });
}

// The key to the model is the gateway's alone (ARCHITECTURE.md, "Security
// posture"): the app's dev server is not given it.
const { ANTHROPIC_API_KEY: _key, ...appEnvironment } = process.env;

start(join("node_modules", ".bin", "vite"), ["--port", APP_PORT, "--strictPort"], join(ROOT, "apps", "web"), {
  ...appEnvironment,
  VITE_SUPABASE_URL: supabase.url,
  VITE_SUPABASE_ANON_KEY: supabase.anonKey,
  VITE_GATEWAY_URL: key === "" ? "" : GATEWAY_URL,
});

console.log(
  [
    "[dev:stack] running:",
    `  Supabase   ${supabase.url}`,
    `  gateway    ${key === "" ? "not started (no ANTHROPIC_API_KEY)" : GATEWAY_URL}`,
    `  web app    ${APP_URL}`,
    "  Ctrl-C stops the gateway and the app; the local Supabase keeps running.",
  ].join("\n"),
);
