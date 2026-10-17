import { lastValueFrom, toArray } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { describeLlmGatewayPortContract } from "@origamic/core/ports/__contracts__/LlmGatewayPortContract.ts";
import type { GenerationEvent, GenerationRequest } from "@origamic/spec";

import { createHttpLlmGateway } from "./httpLlmGateway.ts";

// The client against a `fetch` that answers as the gateway does, its NDJSON
// cut into chunks that end mid-line. The client against the real gateway, on
// a real port, is packages/integration's llmGatewayOverHttp.port.test.ts.
afterEach(() => {
  vi.unstubAllGlobals();
});

describeLlmGatewayPortContract("the HTTP LLM gateway", (reply) => {
  answerWith(ndjson(reply));

  return Promise.resolve(createGateway());
});

describe("the HTTP LLM gateway", () => {
  it("posts the request to the gateway's /generate, with the caller's token", async () => {
    const seen = answerWith(ndjson([PROPOSAL_LESS_FAILURE]));

    await eventsOf(createGateway());

    expect(seen).toEqual([
      {
        url: "http://gateway.test/generate",
        method: "POST",
        authorization: "Bearer a-token",
        contentType: "application/json",
        body: createRequest(),
      },
    ]);
  });

  it("keeps the path the gateway is served under", async () => {
    const seen = answerWith(ndjson([PROPOSAL_LESS_FAILURE]));

    await eventsOf(createGateway(undefined, "http://gateway.test/api"));
    answerWith(ndjson([PROPOSAL_LESS_FAILURE]), seen);
    await eventsOf(createGateway(undefined, "http://gateway.test/api/"));

    expect(
      seen.map(({ url }) => {
        return url;
      }),
    ).toEqual([
      "http://gateway.test/api/generate",
      "http://gateway.test/api/generate",
    ]);
  });

  it("a session that cannot be read says to sign in, and asks nothing", async () => {
    const seen = answerWith(ndjson([PROPOSAL_LESS_FAILURE]));

    const events = await eventsOf(
      createGateway(() => {
        return Promise.reject(new Error("the session store is locked"));
      }),
    );

    expect(seen).toEqual([]);
    expect(events).toEqual([
      {
        kind: "failed",
        message: expect.stringContaining("sign in"),
        problems: [],
      },
    ]);
  });

  it("an expired token is a failed event that says to sign in again", async () => {
    answerWith(
      new Response(JSON.stringify(PROPOSAL_LESS_FAILURE), { status: 401 }),
    );

    expect(await eventsOf(createGateway())).toEqual([
      {
        kind: "failed",
        message: expect.stringContaining("sign in again"),
        problems: [],
      },
    ]);
  });

  it("asks nothing without a token, and says to sign in", async () => {
    const seen = answerWith(ndjson([PROPOSAL_LESS_FAILURE]));

    const events = await eventsOf(
      createGateway(() => {
        return Promise.resolve(null);
      }),
    );

    expect(seen).toEqual([]);
    expect(events).toEqual([
      {
        kind: "failed",
        message: expect.stringContaining("Sign in"),
        problems: [],
      },
    ]);
  });

  it("passes on the failure the gateway words, with its problems", async () => {
    const refusal: GenerationEvent = {
      kind: "failed",
      message: "The request is not a generation request.",
      problems: [{ path: "intent", message: "Too small" }],
    };

    answerWith(new Response(JSON.stringify(refusal), { status: 400 }));

    expect(await eventsOf(createGateway())).toEqual([refusal]);
  });

  it("says the status of a refusal it cannot read", async () => {
    answerWith(new Response("Bad gateway", { status: 502 }));

    expect(await eventsOf(createGateway())).toEqual([
      {
        kind: "failed",
        message: expect.stringContaining("502"),
        problems: [],
      },
    ]);
  });

  it("ends at an event it cannot read, saying where it is wrong", async () => {
    answerWith(
      new Response(
        `${JSON.stringify(PROGRESS)}\n{"kind":"progress"}\n${JSON.stringify(PROPOSAL_LESS_FAILURE)}\n`,
      ),
    );

    expect(await eventsOf(createGateway())).toEqual([
      PROGRESS,
      {
        kind: "failed",
        message: expect.stringContaining("cannot read"),
        problems: [{ path: "message", message: expect.any(String) }],
      },
    ]);
  });

  it("ends a line that is not JSON with a failure", async () => {
    answerWith(new Response("{ not json\n"));

    expect(await eventsOf(createGateway())).toEqual([
      {
        kind: "failed",
        message: expect.stringContaining("cannot read"),
        problems: expect.any(Array),
      },
    ]);
  });

  it("fails an answer that ends before a proposal", async () => {
    answerWith(ndjson([PROGRESS]));

    expect(await eventsOf(createGateway())).toEqual([
      PROGRESS,
      {
        kind: "failed",
        message: expect.stringContaining("ended before"),
        problems: [],
      },
    ]);
  });

  it("reads a last line that has no newline", async () => {
    answerWith(new Response(JSON.stringify(PROPOSAL_LESS_FAILURE)));

    expect(await eventsOf(createGateway())).toEqual([PROPOSAL_LESS_FAILURE]);
  });

  it("fails a generation when the gateway cannot be reached", async () => {
    vi.stubGlobal("fetch", (): Promise<Response> => {
      return Promise.reject(new TypeError("fetch failed"));
    });

    expect(await eventsOf(createGateway())).toEqual([
      {
        kind: "failed",
        message: expect.stringContaining("could not be reached"),
        problems: [],
      },
    ]);
  });

  it("stops the request when the caller unsubscribes", async () => {
    const signals: AbortSignal[] = [];

    vi.stubGlobal(
      "fetch",
      (_input: URL, init: RequestInit): Promise<Response> => {
        if (init.signal) {
          signals.push(init.signal);
        }

        return new Promise<Response>(() => {});
      },
    );

    const subscription = createGateway()
      .generate(createRequest())
      .subscribe(() => {});

    await vi.waitFor(() => {
      expect(signals).toHaveLength(1);
    });
    subscription.unsubscribe();

    expect(signals[0]?.aborted).toBe(true);
  });
});

const PROGRESS: GenerationEvent = { kind: "progress", message: "Asking" };

const PROPOSAL_LESS_FAILURE: GenerationEvent = {
  kind: "failed",
  message: "The model declined to answer.",
  problems: [],
};

interface Seen {
  url: string;
  method: string | undefined;
  authorization: string | null;
  contentType: string | null;
  body: unknown;
}

type AccessToken = () => Promise<string | null>;

function createGateway(
  accessToken: AccessToken = () => {
    return Promise.resolve("a-token");
  },
  url = "http://gateway.test",
): ReturnType<typeof createHttpLlmGateway> {
  return createHttpLlmGateway({ url, accessToken });
}

function createRequest(): GenerationRequest {
  return {
    format: 1,
    intent: "a book tracker",
    ontology: {
      format: 1,
      version: 0,
      objectTypes: [],
      linkTypes: [],
      actionTypes: [],
    },
  };
}

function eventsOf(
  gateway: ReturnType<typeof createHttpLlmGateway>,
): Promise<GenerationEvent[]> {
  return lastValueFrom(gateway.generate(createRequest()).pipe(toArray()));
}

/** Stands in for `fetch` with one answer, and records each request in `seen`. */
function answerWith(answer: Response, seen: Seen[] = []): Seen[] {
  vi.stubGlobal("fetch", (input: URL, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);

    seen.push({
      url: input.toString(),
      method: init.method,
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    });

    return Promise.resolve(answer);
  });

  return seen;
}

/** The events as the gateway streams them, one a line, in chunks of seven bytes, so most chunks end mid-line. */
function ndjson(events: readonly GenerationEvent[]): Response {
  const bytes = new TextEncoder().encode(
    events
      .map((event) => {
        return `${JSON.stringify(event)}\n`;
      })
      .join(""),
  );

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller: ReadableStreamDefaultController<Uint8Array>): void {
        for (let start = 0; start < bytes.length; start += 7) {
          controller.enqueue(bytes.slice(start, start + 7));
        }

        controller.close();
      },
    }),
  );
}
