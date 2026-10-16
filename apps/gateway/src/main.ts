import type { AddressInfo } from "node:net";

import { createAnthropicModel, type Effort } from "./anthropicModel.ts";
import { createGatewayServer } from "./server.ts";
import { createSupabaseVerifier } from "./verify.ts";

// The gateway's composition root: read the environment, pick the model and
// the verifier, start. The key to the model lives here and nowhere else
// (ARCHITECTURE.md, "Security posture").
//
//   ANTHROPIC_API_KEY        the key the model is called with (required)
//   SUPABASE_URL             where Supabase answers (required)
//   SUPABASE_ANON_KEY        the key a token check is signed with (required)
//   GATEWAY_ALLOWED_ORIGIN   the web app's origin (default http://localhost:5173)
//   GATEWAY_MODEL            the model (default claude-opus-5-5)
//   GATEWAY_EFFORT           low, medium, high, xhigh or max (default high)
//   PORT                     where the gateway listens (default 8787)

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

const server = createGatewayServer({
  verify: createSupabaseVerifier({
    url: required("SUPABASE_URL"),
    anonKey: required("SUPABASE_ANON_KEY"),
  }),
  model: createAnthropicModel({
    apiKey: required("ANTHROPIC_API_KEY"),
    model: process.env.GATEWAY_MODEL ?? "claude-opus-5-5",
    effort: effortOf(process.env.GATEWAY_EFFORT ?? "high"),
  }),
  allowedOrigin: process.env.GATEWAY_ALLOWED_ORIGIN ?? "http://localhost:5173",
});

server.listen(Number(process.env.PORT ?? 8787), () => {
  const { port } = server.address() as AddressInfo;

  console.info(`gateway listening on http://localhost:${port}`);
});

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(`${name} is not set; the gateway cannot start without it`);
  }

  return value;
}

function effortOf(value: string): Effort {
  const effort = EFFORTS.find((known) => {
    return known === value;
  });

  if (effort === undefined) {
    throw new Error(
      `GATEWAY_EFFORT is "${value}"; it is one of ${EFFORTS.join(", ")}`,
    );
  }

  return effort;
}
