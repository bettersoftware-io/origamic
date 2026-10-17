import type { AddressInfo } from "node:net";

import { checkAnthropicModel, createAnthropicModel } from "./anthropicModel.ts";
import { configOf } from "./config.ts";
import { createGatewayServer } from "./server.ts";
import { createSupabaseVerifier } from "./verify.ts";

// The gateway's composition root: read and check the environment, confirm
// the model with the API, pick the model and the verifier, start. The key to
// the model lives here and nowhere else (ARCHITECTURE.md, "Security
// posture"). config.ts lists the variables.

const config = configOf(process.env);

await checkAnthropicModel(config.anthropic);

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
