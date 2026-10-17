import type { ProjectCoverageConfig } from "./coverage/lib/config.mts";

// What this project leaves out of the coverage measurement, and why. Every
// entry needs its reason. The bar and the default exclusions (test code) are
// in tools/coverage/lib/config.mts, which belongs to the add-on.
const config: ProjectCoverageConfig = {
  exclude: {
    "apps/web/src/main.tsx":
      "the browser's entry point: it only reads the build's variables and calls startApp(), each of which is tested; importing it in a test would start the app",
    "apps/gateway/src/main.ts":
      "the gateway's entry point: it only reads the environment and calls createGatewayServer(), which is tested; importing it in a test would start a server",
    "apps/gateway/src/anthropicModel.ts":
      "the one call to the real model: no test in the gate calls a model (ADR-0011), and what it sends is anthropicSchemaOf(), which is tested",
  },
};

export default config;
