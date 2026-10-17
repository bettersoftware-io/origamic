import { describe, expect, it } from "vitest";

import { configOf } from "./config.ts";

describe("the gateway's configuration", () => {
  it("takes the defaults for everything but the secrets and Supabase's address", () => {
    expect(configOf(createEnvironment())).toEqual({
      port: 8787,
      allowedOrigin: "http://localhost:5173",
      deadlineMs: 300_000,
      anthropic: {
        apiKey: "sk-test",
        model: "claude-opus-5-5",
        effort: "high",
        timeoutMs: 300_000,
      },
      supabase: { url: "http://127.0.0.1:54321", anonKey: "anon" },
    });
  });

  it("reads what is set", () => {
    const config = configOf(
      createEnvironment({
        PORT: "9000",
        GATEWAY_ALLOWED_ORIGIN: "https://origamic.example",
        GATEWAY_MODEL: "claude-sonnet-5-5",
        GATEWAY_EFFORT: "xhigh",
        GATEWAY_DEADLINE_SECONDS: "120",
      }),
    );

    expect(config).toMatchObject({
      port: 9000,
      allowedOrigin: "https://origamic.example",
      deadlineMs: 120_000,
      anthropic: {
        model: "claude-sonnet-5-5",
        effort: "xhigh",
        timeoutMs: 120_000,
      },
    });
  });

  it.each([
    ["ANTHROPIC_API_KEY", undefined, "ANTHROPIC_API_KEY is not set"],
    ["SUPABASE_URL", "", "SUPABASE_URL is not set"],
    ["SUPABASE_ANON_KEY", undefined, "SUPABASE_ANON_KEY is not set"],
    ["SUPABASE_URL", "localhost", "SUPABASE_URL is not a URL"],
    ["GATEWAY_MODEL", "gpt-5", 'GATEWAY_MODEL is "gpt-5"'],
    ["GATEWAY_MODEL", "Claude Opus", 'GATEWAY_MODEL is "Claude Opus"'],
    ["GATEWAY_EFFORT", "huge", 'GATEWAY_EFFORT is "huge"'],
    ["GATEWAY_DEADLINE_SECONDS", "0", 'GATEWAY_DEADLINE_SECONDS is "0"'],
    ["GATEWAY_DEADLINE_SECONDS", "1.5", 'GATEWAY_DEADLINE_SECONDS is "1.5"'],
    ["PORT", "70000", 'PORT is "70000"'],
    ["PORT", "-1", 'PORT is "-1"'],
    [
      "GATEWAY_ALLOWED_ORIGIN",
      "http://localhost:5173/app",
      'GATEWAY_ALLOWED_ORIGIN is "http://localhost:5173/app"',
    ],
  ])("refuses to start when %s is %j", (name, value, message) => {
    expect(() => {
      return configOf(createEnvironment({ [name]: value }));
    }).toThrow(message);
  });
});

type Environment = Record<string, string | undefined>;

function createEnvironment(overrides: Environment = {}): Environment {
  return {
    ANTHROPIC_API_KEY: "sk-test",
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_ANON_KEY: "anon",
    ...overrides,
  };
}
