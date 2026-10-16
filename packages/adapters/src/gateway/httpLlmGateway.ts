import { Observable, type Subscriber } from "rxjs";

import type { LlmGatewayPort } from "@origamic/core";
import {
  GenerationEvent,
  type GenerationRequest,
  type Problem,
} from "@origamic/spec";

/** Where the gateway answers, and the caller's Supabase access token, or null when nobody is signed in. */
export interface HttpLlmGatewayConfig {
  url: string;
  accessToken: () => Promise<string | null>;
}

/**
 * The LlmGatewayPort over HTTP: the browser's client of `apps/gateway`. It
 * posts the request to `/generate` with the caller's token and reads the
 * answer one JSON event a line, each parsed with spec's `GenerationEvent`.
 * Every way it can go wrong (no token, an expired one, a gateway that cannot
 * be reached, a line it cannot read) ends the stream with a `failed` event,
 * never an error. Unsubscribing stops the request.
 */
export function createHttpLlmGateway(
  config: HttpLlmGatewayConfig,
): LlmGatewayPort {
  const endpoint = new URL("/generate", config.url);

  return {
    generate: (request: GenerationRequest): Observable<GenerationEvent> => {
      return new Observable<GenerationEvent>((subscriber) => {
        const stop = new AbortController();
        const call: Call = { endpoint, config, request, signal: stop.signal };

        // Nothing waits for the request: it speaks through `subscriber`, and
        // the catch turns what is left (a gateway that cannot be reached)
        // into the stream's last event, unless the caller has gone.
        void deliver(call, subscriber).catch(() => {
          if (!stop.signal.aborted) {
            end(subscriber, failed(UNREACHABLE));
          }
        });

        return (): void => {
          stop.abort();
        };
      });
    },
  };
}

const SIGN_IN = "Sign in to ask for an app.";
const SIGN_IN_AGAIN = "Your session has expired: sign in again.";
const UNREACHABLE =
  "The gateway could not be reached. Check the connection and try again.";

interface Call {
  endpoint: URL;
  config: HttpLlmGatewayConfig;
  request: GenerationRequest;
  signal: AbortSignal;
}

async function deliver(
  { endpoint, config, request, signal }: Call,
  subscriber: Subscriber<GenerationEvent>,
): Promise<void> {
  const token = await config.accessToken();

  if (token === null) {
    end(subscriber, failed(SIGN_IN));

    return;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (response.status === 401) {
    end(subscriber, failed(SIGN_IN_AGAIN));

    return;
  }

  if (!response.ok) {
    end(subscriber, await refusalOf(response));

    return;
  }

  for await (const line of linesOf(response.body)) {
    const parsed = GenerationEvent.safeParse(jsonOf(line));

    if (!parsed.success) {
      end(
        subscriber,
        failed(
          "The gateway sent an event this client cannot read.",
          parsed.error.issues.map((issue): Problem => {
            return {
              path: issue.path.map(String).join("."),
              message: issue.message,
            };
          }),
        ),
      );

      return;
    }

    subscriber.next(parsed.data);

    if (parsed.data.kind !== "progress") {
      subscriber.complete();

      return;
    }
  }

  end(subscriber, failed("The gateway's answer ended before a proposal."));
}

/** The gateway words each refusal as a `failed` event; one it did not word is said by its status. */
async function refusalOf(response: Response): Promise<GenerationEvent> {
  const parsed = GenerationEvent.safeParse(jsonOf(await response.text()));

  return parsed.success && parsed.data.kind === "failed"
    ? parsed.data
    : failed(`The gateway answered ${response.status}.`);
}

/** The body's lines as they arrive, the last one too when it has no newline. Blank lines are skipped. */
async function* linesOf(
  body: ReadableStream<Uint8Array> | null,
): AsyncGenerator<string> {
  if (body === null) {
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      const lines = (
        pending + decoder.decode(chunk.value, { stream: true })
      ).split("\n");

      pending = lines.pop() ?? "";
      yield* lines.filter(isSomething);
    }

    const last = pending + decoder.decode();

    if (isSomething(last)) {
      yield last;
    }
  } finally {
    // A generation that ended early leaves the rest of the body unread.
    await reader.cancel();
  }
}

function isSomething(line: string): boolean {
  return line.trim() !== "";
}

function jsonOf(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);

    return value;
  } catch {
    return undefined;
  }
}

function end(
  subscriber: Subscriber<GenerationEvent>,
  event: GenerationEvent,
): void {
  subscriber.next(event);
  subscriber.complete();
}

function failed(message: string, problems: Problem[] = []): GenerationEvent {
  return { kind: "failed", message, problems };
}
