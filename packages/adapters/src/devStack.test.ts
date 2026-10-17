import { describe, expect, it } from "vitest";

// biome-ignore-start lint/style/noRestrictedImports: the tool is in tools/, outside every package, where no #/ alias reaches; this test holds its rule because tools/ has no test runner
import { openDevSupabase, planDevStack } from "../../../tools/dev/devStack.mts";

// biome-ignore-end lint/style/noRestrictedImports: the import above

// What `pnpm dev:stack` gives the programs it starts, and which Supabase it
// starts them on.
describe("the dev stack", () => {
  it("starts the gateway with the key to the model, and the web app with the gateway's address but not the key", () => {
    const plan = planDevStack(DEV_SUPABASE, {
      ANTHROPIC_API_KEY: "sk-test",
      HOME: "/home/builder",
    });

    expect(plan.gateway).toEqual({
      ANTHROPIC_API_KEY: "sk-test",
      HOME: "/home/builder",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_ANON_KEY: "anon",
      GATEWAY_ALLOWED_ORIGIN: "http://localhost:5173",
      PORT: "8787",
    });
    expect(plan.app).toEqual({
      HOME: "/home/builder",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_GATEWAY_URL: "http://localhost:8787",
    });
  });

  it("starts no gateway without a key, and the web app on the scripted model", () => {
    const plan = planDevStack(DEV_SUPABASE, { ANTHROPIC_API_KEY: "" });

    expect(plan.gateway).toBeUndefined();
    expect(plan.app).toEqual({
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "anon",
      VITE_GATEWAY_URL: "",
    });
  });

  it("runs on the Supabase it is handed to start: the dev stack's, by default", async () => {
    await expect(
      openDevSupabase(() => {
        return Promise.resolve(DEV_SUPABASE);
      }),
    ).resolves.toBe(DEV_SUPABASE);
  });
});

const DEV_SUPABASE = {
  url: "http://127.0.0.1:54321",
  anonKey: "anon",
  serviceRoleKey: "service",
};
