// What `pnpm dev:stack` (stack.mts) gives each program it starts: the
// gateway, when there is a key to the model, and the web app's dev server.
// Kept apart from the script that starts them, so it can be tested.

import type { LocalSupabase } from "../supabase/cli.mts";
import { startDevSupabase } from "../supabase/localSupabase.mts";

/** The web app's address: the gateway lets only this origin call it. */
export const APP_PORT = "5173";
export const APP_URL = `http://localhost:${APP_PORT}`;
export const GATEWAY_PORT = "8787";
export const GATEWAY_URL = `http://localhost:${GATEWAY_PORT}`;

/** The environment of each program to start: the gateway's only when it is started. */
export interface DevStackPlan {
  gateway?: NodeJS.ProcessEnv;
  app: NodeJS.ProcessEnv;
}

/**
 * The dev Supabase (`origamic`), started or found running with this
 * checkout's pending migrations: `startDevSupabase`, which never resets it,
 * and never the tests' stack.
 */
export function openDevSupabase(start: () => Promise<LocalSupabase> = startDevSupabase): Promise<LocalSupabase> {
  return start();
}

/**
 * The gateway, given the key and Supabase's address, when the environment
 * has a key to the model; and the web app, given Supabase's address and the
 * gateway's when there is one. The key to the model is the gateway's alone
 * (ARCHITECTURE.md, "Security posture"): the app's environment has none.
 */
export function planDevStack(supabase: LocalSupabase, environment: NodeJS.ProcessEnv): DevStackPlan {
  const { ANTHROPIC_API_KEY: key = "", ...withoutKey } = environment;
  const app = {
    ...withoutKey,
    VITE_SUPABASE_URL: supabase.url,
    VITE_SUPABASE_ANON_KEY: supabase.anonKey,
    VITE_GATEWAY_URL: key === "" ? "" : GATEWAY_URL,
  };

  if (key === "") {
    return { app };
  }

  return {
    gateway: {
      ...environment,
      SUPABASE_URL: supabase.url,
      SUPABASE_ANON_KEY: supabase.anonKey,
      GATEWAY_ALLOWED_ORIGIN: APP_URL,
      PORT: GATEWAY_PORT,
    },
    app,
  };
}

/** What running the dev stack starts and asks, as seams. */
export interface DevStackRun {
  /** Starts, or finds, the dev Supabase. */
  open: () => Promise<LocalSupabase>;
  /** Whether the run was told to stop (Ctrl-C, a kill) while it waited. */
  stopped: () => boolean;
  startGateway: (environment: NodeJS.ProcessEnv) => void;
  startApp: (environment: NodeJS.ProcessEnv) => void;
  say: (line: string) => void;
}

/**
 * Opens the dev Supabase, then starts the gateway when there is a key and the
 * web app. A stop that came while the Supabase was starting is kept: nothing
 * is started after it. Gives back the Supabase and the plan it started on,
 * or `undefined` when it started nothing.
 */
export async function runDevStack(run: DevStackRun, environment: NodeJS.ProcessEnv): Promise<StartedDevStack | undefined> {
  const supabase = await run.open();

  if (run.stopped()) {
    run.say("[dev:stack] stopped while the dev Supabase started: nothing else was started");

    return undefined;
  }

  const plan = planDevStack(supabase, environment);

  if (plan.gateway === undefined) {
    run.say("[dev:stack] ANTHROPIC_API_KEY is not set: the gateway is not started, and the model is the dev script's");
  } else {
    run.startGateway(plan.gateway);
  }

  run.startApp(plan.app);

  return { supabase, plan };
}

/** What a run of the dev stack started on, and what it started. */
export interface StartedDevStack {
  supabase: LocalSupabase;
  plan: DevStackPlan;
}
