import { describe, expect, it, onTestFinished, vi } from "vitest";

import { readBuildEnv, readWebEnv } from "./env.ts";

describe("reading the build's configuration", () => {
  it("runs on the simulators when nothing is set, or set empty", () => {
    expect(readWebEnv({})).toEqual({});
    expect(
      readWebEnv({
        VITE_SUPABASE_URL: "",
        VITE_SUPABASE_ANON_KEY: "",
        VITE_GATEWAY_URL: "",
      }),
    ).toEqual({});
  });

  it("runs on Supabase with its address and key, and on the gateway with its address", () => {
    expect(
      readWebEnv({
        VITE_SUPABASE_URL: SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: "anon",
      }),
    ).toEqual({ supabase: { url: SUPABASE_URL, anonKey: "anon" } });
    expect(
      readWebEnv({
        VITE_SUPABASE_URL: SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: "anon",
        VITE_GATEWAY_URL: GATEWAY_URL,
      }),
    ).toEqual({
      supabase: { url: SUPABASE_URL, anonKey: "anon" },
      gatewayUrl: GATEWAY_URL,
    });
  });

  it("refuses Supabase's address without its key, and its key without its address", () => {
    expect(() => {
      return readWebEnv({ VITE_SUPABASE_URL: SUPABASE_URL });
    }).toThrow(
      "VITE_SUPABASE_URL is set and VITE_SUPABASE_ANON_KEY is not: set both to run on Supabase, or neither to run on the simulators",
    );
    expect(() => {
      return readWebEnv({ VITE_SUPABASE_ANON_KEY: "anon" });
    }).toThrow("VITE_SUPABASE_ANON_KEY is set and VITE_SUPABASE_URL is not");
  });

  it("reads the build's own variables", () => {
    vi.stubEnv("VITE_SUPABASE_URL", SUPABASE_URL);
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("VITE_GATEWAY_URL", "");
    onTestFinished(() => {
      vi.unstubAllEnvs();
    });

    expect(readBuildEnv()).toEqual({
      supabase: { url: SUPABASE_URL, anonKey: "anon" },
    });
  });

  it("refuses a gateway without Supabase, whose token it needs", () => {
    expect(() => {
      return readWebEnv({ VITE_GATEWAY_URL: GATEWAY_URL });
    }).toThrow(
      "VITE_GATEWAY_URL is set without VITE_SUPABASE_URL: the gateway serves only a caller Supabase has signed in",
    );
  });
});

const SUPABASE_URL = "http://127.0.0.1:54321";
const GATEWAY_URL = "http://localhost:8787";
