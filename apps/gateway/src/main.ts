import type { AddressInfo } from "node:net";

import { checkAnthropicModel, createAnthropicModel } from "./anthropicModel.ts";
import { verdictOfModelCheck } from "./anthropicReply.ts";
import { configOf } from "./config.ts";
import { createGatewayServer } from "./server.ts";
import { createSupabaseVerifier } from "./verify.ts";

// The gateway's composition root: read and check the environment, confirm
// the model with the API (a refused key or model stops it; an API that
// cannot answer now is a warning), pick the model and the verifier, start. The key to
// the model lives here and nowhere else (ARCHITECTURE.md, "Security
// posture"). config.ts lists the variables.

const config = configOf(process.env);

const verdict = verdictOfModelCheck(
  config.anthropic.model,
  await checkAnthropicModel(config.anthropic),
);

if (verdict.kind === "stop") {
  throw new Error(verdict.message);
}

if (verdict.kind === "warn") {
  console.warn(verdict.message);
}

const server = createGatewayServer({
  verify: createSupabaseVerifier(config.supabase),
  model: createAnthropicModel(config.anthropic),
  allowedOrigin: config.allowedOrigin,
  deadlineMs: config.deadlineMs,
});

server.listen(config.port, () => {
  const { port } = server.address() as AddressInfo;

  console.info(`gateway listening on http://localhost:${port}`);
});
