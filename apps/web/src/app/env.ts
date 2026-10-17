/** What the composition root is configured with: where Supabase and the gateway answer. Each left out runs on a simulator. */
export interface WebEnv {
  supabase?: { url: string; anonKey: string };
  gatewayUrl?: string;
}

/** The variables the build is given, as `import.meta.env` holds them. */
type Variables = Readonly<Record<string, unknown>>;

/**
 * The configuration, from the build's variables. A variable that is unset or
 * empty is left out, so an empty one in the shell cannot half-configure the
 * app. It throws, saying which variable, on a configuration that cannot run:
 * Supabase's address without its key or the other way round, and a gateway
 * without Supabase, whose token the gateway needs.
 *
 *   VITE_SUPABASE_URL        where Supabase answers
 *   VITE_SUPABASE_ANON_KEY   the key the browser signs its requests with
 *   VITE_GATEWAY_URL         where the gateway answers
 */
export function readWebEnv(variables: Variables): WebEnv {
  const url = variableOf(variables, "VITE_SUPABASE_URL");
  const anonKey = variableOf(variables, "VITE_SUPABASE_ANON_KEY");
  const gatewayUrl = variableOf(variables, "VITE_GATEWAY_URL");

  if ((url === undefined) !== (anonKey === undefined)) {
    throw new Error(
      `${url === undefined ? "VITE_SUPABASE_ANON_KEY" : "VITE_SUPABASE_URL"} is set and ${url === undefined ? "VITE_SUPABASE_URL" : "VITE_SUPABASE_ANON_KEY"} is not: set both to run on Supabase, or neither to run on the simulators`,
    );
  }

  if (gatewayUrl !== undefined && url === undefined) {
    throw new Error(
      "VITE_GATEWAY_URL is set without VITE_SUPABASE_URL: the gateway serves only a caller Supabase has signed in",
    );
  }

  return {
    ...(url === undefined || anonKey === undefined
      ? {}
      : { supabase: { url, anonKey } }),
    ...(gatewayUrl === undefined ? {} : { gatewayUrl }),
  };
}

function variableOf(variables: Variables, name: string): string | undefined {
  const value = variables[name];

  return typeof value === "string" && value !== "" ? value : undefined;
}

/** The configuration this build was given: what `readWebEnv` reads from the build's own variables. */
export function readBuildEnv(): WebEnv {
  return readWebEnv(import.meta.env);
}
