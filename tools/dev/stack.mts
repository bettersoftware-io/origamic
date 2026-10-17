#!/usr/bin/env node
// `pnpm dev:stack`: the web app against a local Supabase and the gateway,
// for the first slice's loop on this machine (FIRST-SLICE.md).
//
//   ANTHROPIC_API_KEY=… pnpm dev:stack
//
// It starts the dev Supabase (`origamic`, the API on 54321) or finds it
// running, with this checkout's pending migrations applied and never a
// reset (`startDevSupabase`); the tests' stack (`origamic-test`) is not
// touched. Then the gateway, with the key, and the web app's dev server
// against both; it prints where each answers. Without ANTHROPIC_API_KEY the
// gateway is not started and the model is the dev script's (the app's
// src/app/devScript.ts). Ctrl-C stops the gateway and the app; the dev
// Supabase is left running (`pnpm --filter @origamic/adapters supabase stop`
// stops it).
//
// Its data is the author's. For a clean database the author runs `pnpm
// --filter @origamic/adapters supabase db reset --local` first, which empties
// the dev stack only.

import { type ChildProcess, spawn } from "node:child_process";
import { join } from "node:path";

import { APP_PORT, APP_URL, GATEWAY_URL, openDevSupabase, planDevStack } from "./devStack.mts";

const ROOT = join(import.meta.dirname, "..", "..");

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

console.log("[dev:stack] starting the dev Supabase (the first start pulls its images, which takes minutes)");

const supabase = await openDevSupabase();
const plan = planDevStack(supabase, process.env);

if (plan.gateway === undefined) {
  console.log("[dev:stack] ANTHROPIC_API_KEY is not set: the gateway is not started, and the model is the dev script's");
} else {
  start("node", ["src/main.ts"], join(ROOT, "apps", "gateway"), plan.gateway);
}

start(join("node_modules", ".bin", "vite"), ["--port", APP_PORT, "--strictPort"], join(ROOT, "apps", "web"), plan.app);

console.log(
  [
    "[dev:stack] running:",
    `  Supabase   ${supabase.url}`,
    `  gateway    ${plan.gateway === undefined ? "not started (no ANTHROPIC_API_KEY)" : GATEWAY_URL}`,
    `  web app    ${APP_URL}`,
    "  Ctrl-C stops the gateway and the app; the dev Supabase keeps running.",
  ].join("\n"),
);
