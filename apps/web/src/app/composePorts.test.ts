import { describe, expect, it, onTestFinished, vi } from "vitest";

import type { CoreDeps } from "@origamic/core";
import { catalog } from "@origamic/runtime";
import {
  type GenerationEvent,
  GenerationRequest,
  type Ontology,
} from "@origamic/spec";

import { composePorts } from "./composePorts.ts";

describe("choosing what stands behind the ports", () => {
  it("runs every port on its simulator with no Supabase, and the model on the dev script", async () => {
    const said = silenceInfo();
    const deps = composePorts({});

    expect(await firstOf(deps.session.user())).toBeNull();
    expect((await firstOf<Ontology>(deps.ontology.current())).version).toBe(0);
    expect(await firstOf(deps.library.apps())).toEqual([]);
    expect(await firstEventOf(deps)).toEqual({
      kind: "progress",
      message: "Reading your ontology",
    });
    expect(deps.catalog).toBe(catalog);
    expect(said).toHaveBeenCalledWith(
      "[data] composed sim: no VITE_SUPABASE_URL",
    );
  });

  it("stores on Supabase when it has its address, with the model on the dev script when there is no gateway", async () => {
    const said = silenceInfo();
    const deps = composePorts({ supabase: SUPABASE });

    expect(await firstEventOf(deps)).toEqual({
      kind: "progress",
      message: "Reading your ontology",
    });
    expect(deps.catalog).toBe(catalog);
    expect(said).toHaveBeenCalledWith(
      "[data] composed Supabase at http://127.0.0.1:1; the model is scripted: no VITE_GATEWAY_URL",
    );
  });

  it("asks the gateway when it has its address, signed in through Supabase", async () => {
    const said = silenceInfo();
    const deps = composePorts({
      supabase: SUPABASE,
      gatewayUrl: "http://127.0.0.1:2",
    });

    // Nobody is signed in on that Supabase, so the gateway's client asks for
    // a sign-in before it sends anything: that is the gateway's client
    // answering, not a script.
    expect(await firstEventOf(deps)).toEqual({
      kind: "failed",
      message: "Sign in to ask for an app.",
      problems: [],
    });
    expect(said).toHaveBeenCalledWith(
      "[data] composed Supabase at http://127.0.0.1:1, the model through http://127.0.0.1:2",
    );
  });
});

/** An address where nothing answers: composing connects to nothing yet. */
const SUPABASE = { url: "http://127.0.0.1:1", anonKey: "anon" };

/** The first event of a generation asked for a new app on an empty ontology. */
function firstEventOf(deps: CoreDeps): Promise<GenerationEvent> {
  return firstOf(
    deps.llm.generate(
      GenerationRequest.parse({
        format: 1,
        intent: "a tracker for the books I'm reading",
        ontology: { format: 1, version: 0, objectTypes: [] },
      }),
    ),
  );
}

/** What a port's stream gives first. */
function firstOf<T>(stream: StreamOf<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const subscription = stream.subscribe({
      next: (value: T): void => {
        resolve(value);
        queueMicrotask(() => {
          subscription.unsubscribe();
        });
      },
      error: reject,
      complete: (): void => {
        reject(new Error("the stream ended without a value"));
      },
    });
  });
}

/** A port's stream, as far as this reads it. */
interface StreamOf<T> {
  subscribe(observer: Observer<T>): Unsubscribable;
}

interface Observer<T> {
  next: (value: T) => void;
  error: (error: unknown) => void;
  complete: () => void;
}

interface Unsubscribable {
  unsubscribe(): void;
}

/** The composition says which source it chose; a test reads that instead of printing it. */
function silenceInfo(): ReturnType<typeof vi.spyOn> {
  const said = vi.spyOn(console, "info").mockImplementation(() => {});

  onTestFinished(() => {
    said.mockRestore();
  });

  return said;
}
