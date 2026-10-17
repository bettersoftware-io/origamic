import {
  createHttpLlmGateway,
  createSupabaseAdapters,
} from "@origamic/adapters";
import {
  type CoreDeps,
  createLlmGatewaySimulator,
  createObjectStoreSimulator,
  createOntologyStoreSimulator,
  createSessionSimulator,
  createSpecLibrarySimulator,
  type LlmGatewayPort,
} from "@origamic/core";
import { catalog } from "@origamic/runtime";

import { createDevScript } from "./devScript.ts";
import type { WebEnv } from "./env.ts";

/**
 * Picks what stands behind each port. This is the only place that chooses an
 * adapter: with Supabase the stores and the session are Supabase's, without
 * it each is its simulator; with a gateway the model is asked through it,
 * without one the model is the dev script's two replies.
 */
export function composePorts(env: WebEnv): CoreDeps {
  if (env.supabase === undefined) {
    console.info("[data] composed sim: no VITE_SUPABASE_URL");

    const ontology = createOntologyStoreSimulator();

    return {
      ontology,
      objects: createObjectStoreSimulator(ontology),
      library: createSpecLibrarySimulator(),
      llm: createLlmGatewaySimulator(createDevScript()),
      session: createSessionSimulator(),
      catalog,
    };
  }

  const { accessToken, ...ports } = createSupabaseAdapters(env.supabase);
  let llm: LlmGatewayPort;

  if (env.gatewayUrl === undefined) {
    console.info(
      `[data] composed Supabase at ${env.supabase.url}; the model is scripted: no VITE_GATEWAY_URL`,
    );
    llm = createLlmGatewaySimulator(createDevScript());
  } else {
    console.info(
      `[data] composed Supabase at ${env.supabase.url}, the model through ${env.gatewayUrl}`,
    );
    llm = createHttpLlmGateway({ url: env.gatewayUrl, accessToken });
  }

  return { ...ports, llm, catalog };
}
