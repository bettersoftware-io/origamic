import { type AddressInfo, connect } from "node:net";

import { describe, expect, it, onTestFinished } from "vitest";

import { GenerationEvent } from "@origamic/spec";

import type { ModelReply } from "./model.ts";
import {
  createGatewayServer,
  createGenerationServer,
  type VerifyCaller,
} from "./server.ts";
import { createFirstReply, createFirstRequest } from "./testing/bookTracker.ts";
import { createScriptedModel } from "./testing/scriptedModel.ts";

describe("the gateway's server", () => {
  it("refuses a request with no token with a 401", async () => {
    const { url } = await startGateway();

    const response = await post(url, createFirstRequest(), { token: null });

    expect(response.status).toBe(401);
    expect(GenerationEvent.parse(await response.json())).toMatchObject({
      kind: "failed",
    });
  });

  it("refuses a token the verifier refuses with a 401", async () => {
    const { url } = await startGateway();

    const response = await post(url, createFirstRequest(), {
      token: "made-up",
    });

    expect(response.status).toBe(401);
  });

  it("answers a request GenerationRequest refuses with a 400 and its problems", async () => {
    const { url } = await startGateway();

    const response = await post(url, { ...createFirstRequest(), intent: "" });
    const event = GenerationEvent.parse(await response.json());

    expect(response.status).toBe(400);
    expect(event).toMatchObject({
      kind: "failed",
      problems: [{ path: "intent" }],
    });
  });

  it("gives another origin no CORS header, and the allowed one its own", async () => {
    const { url } = await startGateway();

    const other = await post(url, createFirstRequest(), {
      origin: "https://elsewhere.example",
    });

    const allowed = await post(url, createFirstRequest(), {
      origin: ALLOWED_ORIGIN,
    });

    expect(other.headers.get("access-control-allow-origin")).toBeNull();
    expect(allowed.headers.get("access-control-allow-origin")).toBe(
      ALLOWED_ORIGIN,
    );
  });

  it("streams a good request's events as NDJSON, one event a line", async () => {
    const { url } = await startGateway();

    const response = await post(url, createFirstRequest());
    const lines = (await response.text()).split("\n");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-ndjson");
    expect(lines.at(-1)).toBe("");
    expect(
      lines.slice(0, -1).map((line) => {
        return GenerationEvent.parse(JSON.parse(line)).kind;
      }),
    ).toEqual(["progress", "progress", "proposal"]);
  });
});

describe("what else the server answers", () => {
  it("answers the allowed origin's preflight, and no other's", async () => {
    const { url } = await startGateway();

    const allowed = await preflight(url, ALLOWED_ORIGIN);
    const other = await preflight(url, "https://elsewhere.example");

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-headers")).toBe(
      "authorization, content-type",
    );
    expect(allowed.headers.get("access-control-allow-methods")).toBe("POST");
    expect(other.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("serves POST /generate only", async () => {
    const { url } = await startGateway();

    const elsewhere = await post(`${url}/other`, createFirstRequest());
    const read = await fetch(`${url}/generate`);

    expect(elsewhere.status).toBe(404);
    expect(read.status).toBe(405);
    expect(read.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("answers a body that is not JSON with a 400", async () => {
    const { url } = await startGateway();

    const response = await fetch(`${url}/generate`, {
      method: "POST",
      headers: { authorization: `Bearer ${GOOD_TOKEN}` },
      body: "{ not json",
    });

    expect(response.status).toBe(400);
    expect(GenerationEvent.parse(await response.json())).toMatchObject({
      message: expect.stringContaining("not JSON"),
    });
  });

  it("answers a body larger than a request can be with a 413", async () => {
    const { url } = await startGateway();

    const response = await fetch(`${url}/generate`, {
      method: "POST",
      headers: { authorization: `Bearer ${GOOD_TOKEN}` },
      body: "x".repeat(2_000_001),
    });

    expect(response.status).toBe(413);
  });

  it("answers with a 502 when the token cannot be checked", async () => {
    const { url } = await startGateway({
      verify: () => {
        return Promise.reject(new Error("Supabase is down"));
      },
    });

    const response = await post(url, createFirstRequest());

    expect(response.status).toBe(502);
    expect(GenerationEvent.parse(await response.json())).toMatchObject({
      kind: "failed",
    });
  });
});

describe("a generation that goes wrong", () => {
  it("ends with a failed line when the generation throws", async () => {
    const { url } = await startGateway({ generate: throwingAfterProgress });

    const response = await post(url, createFirstRequest());
    const kinds = (await response.text())
      .trim()
      .split("\n")
      .map((line) => {
        return GenerationEvent.parse(JSON.parse(line)).kind;
      });

    expect(kinds).toEqual(["progress", "failed"]);
  });

  it("keeps answering after a request is cut off in the middle of its body", async () => {
    const { url } = await startGateway();

    await cutOffMidBody(url);
    const next = await post(url, createFirstRequest());

    expect(next.status).toBe(200);
  });
});

const ALLOWED_ORIGIN = "http://localhost:5173";
const GOOD_TOKEN = "good-token";

interface Running {
  url: string;
}

interface Overrides {
  verify?: VerifyCaller;
  replies?: readonly ModelReply[];
  /** A generation of its own, in place of the gateway's with a scripted model. */
  generate?: () => AsyncIterable<GenerationEvent>;
}

/** The gateway on a free port, with a scripted model and a verifier that accepts one token. Closed when the test ends. */
async function startGateway(overrides: Overrides = {}): Promise<Running> {
  const verify = overrides.verify ?? acceptOneToken;
  const server =
    overrides.generate === undefined
      ? createGatewayServer({
          verify,
          model: createScriptedModel(
            overrides.replies ?? [{ kind: "json", value: createFirstReply() }],
          ),
          allowedOrigin: ALLOWED_ORIGIN,
        })
      : createGenerationServer({
          verify,
          generate: overrides.generate,
          allowedOrigin: ALLOWED_ORIGIN,
        });

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

  return { url: `http://127.0.0.1:${port}` };
}

function acceptOneToken(token: string): ReturnType<VerifyCaller> {
  return Promise.resolve(
    token === GOOD_TOKEN
      ? { kind: "user", id: "builder" }
      : { kind: "refused" },
  );
}

interface PostOptions {
  token?: string | null;
  origin?: string;
}

/** A POST to `/generate` (or to `url` when it names a path), with the good token unless told otherwise. */
function post(
  url: string,
  body: unknown,
  { token = GOOD_TOKEN, origin }: PostOptions = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });

  if (token !== null) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (origin !== undefined) {
    headers.set("origin", origin);
  }

  const target = new URL(url).pathname === "/" ? `${url}/generate` : url;

  return fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function preflight(url: string, origin: string): Promise<Response> {
  return fetch(`${url}/generate`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization, content-type",
    },
  });
}

async function* throwingAfterProgress(): AsyncGenerator<GenerationEvent> {
  yield { kind: "progress", message: "Asking the model" };

  throw new Error("a bug in the generation");
}

/** Sends a request that promises a longer body than it sends, then closes the connection. */
function cutOffMidBody(url: string): Promise<void> {
  const { hostname, port } = new URL(url);

  return new Promise<void>((resolve) => {
    const socket = connect(Number(port), hostname, () => {
      socket.end(
        [
          "POST /generate HTTP/1.1",
          `host: ${hostname}`,
          `authorization: Bearer ${GOOD_TOKEN}`,
          "content-length: 1000",
          "",
          '{"format":',
        ].join("\r\n"),
      );
    });

    socket.on("close", () => {
      resolve();
    });
    socket.resume();
  });
}
