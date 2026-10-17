import type { AnthropicConfig, Effort } from "./anthropicModel.ts";
import type { SupabaseConfig } from "./verify.ts";

/** Everything the gateway reads from its environment, checked. */
export interface GatewayConfig {
  port: number;
  /** The one origin a browser may call the gateway from: the web app's. */
  allowedOrigin: string;
  /** How long one generation may take in all. */
  deadlineMs: number;
  anthropic: AnthropicConfig;
  supabase: SupabaseConfig;
}

type Environment = Readonly<Record<string, string | undefined>>;

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** An Anthropic model id as the API names it: `claude-opus-5-5`. Whether the API has it is asked when the gateway starts. */
const MODEL_ID = /^claude-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The gateway's configuration, from its environment. It throws, saying which
 * variable and why, rather than start with a value it would only find wrong
 * on the first request.
 *
 *   ANTHROPIC_API_KEY          the key the model is called with (required)
 *   SUPABASE_URL               where Supabase answers (required)
 *   SUPABASE_ANON_KEY          the key a token check is signed with (required)
 *   GATEWAY_ALLOWED_ORIGIN     the web app's origin (default http://localhost:5173)
 *   GATEWAY_MODEL              the model (default claude-opus-5-5)
 *   GATEWAY_EFFORT             low, medium, high, xhigh or max (default high)
 *   GATEWAY_DEADLINE_SECONDS   how long a generation may take (default 300)
 *   PORT                       where the gateway listens (default 8787)
 */
export function configOf(environment: Environment): GatewayConfig {
  const deadlineMs =
    whole(environment, "GATEWAY_DEADLINE_SECONDS", "300", 1, 3600) * 1000;

  return {
    port: whole(environment, "PORT", "8787", 0, 65_535),
    allowedOrigin: origin(environment),
    deadlineMs,
    anthropic: {
      apiKey: required(environment, "ANTHROPIC_API_KEY"),
      model: model(environment),
      effort: effort(environment),
      timeoutMs: deadlineMs,
    },
    supabase: {
      url: url(environment, "SUPABASE_URL"),
      anonKey: required(environment, "SUPABASE_ANON_KEY"),
    },
  };
}

function required(environment: Environment, name: string): string {
  const value = environment[name];

  if (value === undefined || value === "") {
    throw new Error(`${name} is not set; the gateway cannot start without it`);
  }

  return value;
}

function url(environment: Environment, name: string): string {
  const value = required(environment, name);

  if (!URL.canParse(value)) {
    throw new Error(`${name} is not a URL: "${value}"`);
  }

  return value;
}

function origin(environment: Environment): string {
  const value = environment.GATEWAY_ALLOWED_ORIGIN ?? "http://localhost:5173";

  if (!URL.canParse(value) || new URL(value).origin !== value) {
    throw new Error(
      `GATEWAY_ALLOWED_ORIGIN is "${value}"; it is an origin, such as http://localhost:5173, with no path`,
    );
  }

  return value;
}

function model(environment: Environment): string {
  const value = environment.GATEWAY_MODEL ?? "claude-opus-5-5";

  if (!MODEL_ID.test(value)) {
    throw new Error(
      `GATEWAY_MODEL is "${value}"; it is an Anthropic model id, such as claude-opus-5-5`,
    );
  }

  return value;
}

function effort(environment: Environment): Effort {
  const value = environment.GATEWAY_EFFORT ?? "high";
  const known = EFFORTS.find((each) => {
    return each === value;
  });

  if (known === undefined) {
    throw new Error(
      `GATEWAY_EFFORT is "${value}"; it is one of ${EFFORTS.join(", ")}`,
    );
  }

  return known;
}

/** A whole number from `least` to `most`. */
function whole(
  environment: Environment,
  name: string,
  fallback: string,
  least: number,
  most: number,
): number {
  const value = environment[name] ?? fallback;
  const number = Number(value);

  if (!/^\d+$/.test(value) || number < least || number > most) {
    throw new Error(
      `${name} is "${value}"; it is a whole number from ${least} to ${most}`,
    );
  }

  return number;
}
