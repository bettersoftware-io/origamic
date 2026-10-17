import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { createCoreHarness } from "@origamic/core/testing/coreHarness.ts";
import { App } from "@origamic/spec";

import { messageOf, showApp } from "./appSnapshot.ts";

describe("what an app view shows", () => {
  it("an app whose elements read no view is shown at once, with its state", async () => {
    const app = App.parse(createGreetingApp());
    const { core } = createCoreHarness();

    expect(await firstValueFrom(showApp(app, core.openApp(app)))).toEqual({
      kind: "shown",
      snapshot: {
        state: { greeting: "Hello" },
        rows: {},
        problems: { page: [] },
      },
    });
  });

  it("says a failure that is not an Error as it is written", () => {
    expect(messageOf("the store is unreachable")).toBe(
      "the store is unreachable",
    );
  });
});

function createGreetingApp(): unknown {
  return {
    format: 1,
    id: "greeting",
    name: "Greeting",
    version: 1,
    ontologyVersion: 0,
    bindings: { types: [{ type: "Note", version: 1 }] },
    ui: {
      root: "page",
      state: { greeting: { initial: "Hello" } },
      elements: {
        page: { component: "Text", props: { text: { $state: "greeting" } } },
      },
    },
  };
}
