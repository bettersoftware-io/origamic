import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { lastValueFrom, toArray } from "rxjs";
import { describe, expect, it, onTestFinished } from "vitest";

import { createHttpLlmGateway } from "@origamic/adapters";
import type { LlmGatewayPort } from "@origamic/core";
import { describeLlmGatewayPortContract } from "@origamic/core/ports/__contracts__/LlmGatewayPortContract.ts";
import {
  type Caller,
  createGatewayServer,
  createGenerationServer,
} from "@origamic/gateway/server.ts";
import {
  createFirstReply,
  createFirstRequest,
} from "@origamic/gateway/testing/bookTracker.ts";
import { createScriptedModel } from "@origamic/gateway/testing/scriptedModel.ts";
import type { GenerationEvent } from "@origamic/spec";

// Each side has its own tests: the client against a stand-in `fetch`, the
// server against raw requests. These run the browser's client against the
// gateway's real server, over a real port: the one thing neither can show
// alone is that they agree on the wire.
describeLlmGatewayPortContract(
  "the HTTP client against the gateway's server",
  async (reply) => {
    const url = await listen(
      createGenerationServer({
        verify: acceptOneToken,
        allowedOrigin: ALLOWED_ORIGIN,
        generate: replaying(reply),
      }),
    );

    return createClient(url, GOOD_TOKEN);
  },
);

describe("the HTTP client against the gateway", () => {
  it("an expired token is a failed event that says to sign in again", async () => {
    const url = await listen(createGateway());

    const events = await eventsOf(createClient(url, "expired"));

    expect(events).toEqual([
      {
        kind: "failed",
        message: expect.stringContaining("sign in again"),
        problems: [],
      },
    ]);
  });

  it("a scripted model's reply arrives as a proposal with versions in its bindings", async () => {
    const url = await listen(createGateway());

    const events = await eventsOf(createClient(url, GOOD_TOKEN));

    expect(events.at(-1)).toMatchObject({
      kind: "proposal",
      proposal: {
        changeSet: { baseVersion: 0 },
        app: {
          bindings: {
            types: [{ type: "Book", version: 1 }],
            actions: [
              { action: "createBook", version: 1 },
              { action: "updateBook", version: 1 },
            ],
          },
        },
      },
    });
  });
});

const ALLOWED_ORIGIN = "http://localhost:5173";
const GOOD_TOKEN = "good-token";

/** The gateway with a model that replies with the book tracker once. */
function createGateway(): Server {
  return createGatewayServer({
    verify: acceptOneToken,
    model: createScriptedModel([{ kind: "json", value: createFirstReply() }]),
    allowedOrigin: ALLOWED_ORIGIN,
  });
}

function createClient(url: string, token: string): LlmGatewayPort {
  return createHttpLlmGateway({
    url,
    accessToken: () => {
      return Promise.resolve(token);
    },
  });
}

function acceptOneToken(token: string): Promise<Caller> {
  return Promise.resolve(
    token === GOOD_TOKEN
      ? { kind: "user", id: "builder" }
      : { kind: "refused" },
  );
}

/** A generation that sends `events` as they are, whatever is asked. */
function replaying(
  events: readonly GenerationEvent[],
): () => AsyncIterable<GenerationEvent> {
  return async function* replay(): AsyncGenerator<GenerationEvent> {
    yield* events;
  };
}

function eventsOf(gateway: LlmGatewayPort): Promise<GenerationEvent[]> {
  return lastValueFrom(gateway.generate(createFirstRequest()).pipe(toArray()));
}

/** Starts `server` on a free port, closed when the test ends, and gives its address. */
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  onTestFinished(() => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  const { port } = server.address() as AddressInfo;

  return `http://127.0.0.1:${port}`;
}
