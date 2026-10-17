import { describe, expect, it } from "vitest";

import { AppDraft } from "@origamic/spec";
import {
  createBookApp,
  createDateFinishedApp,
} from "@origamic/spec/testing/bookTracker.ts";

import { diffApps } from "./diffApps.ts";

describe("diffApps", () => {
  it("a new app adds its bindings, elements, views and state", () => {
    expect(diffApps(null, AppDraft.parse(createBookApp()))).toEqual({
      added: [
        "binding Book@1",
        "binding createBook@1",
        "binding updateBook@1",
        "element page",
        "element statusFilter",
        "element table",
        "element addForm",
        "element editForm",
        "view books",
        "state status",
        "state selected",
        "state editing",
      ],
      removed: [],
      changed: [],
    });
  });

  it("the date-finished revision moves two bindings and changes two elements", () => {
    expect(
      diffApps(
        AppDraft.parse(createBookApp()),
        AppDraft.parse(createDateFinishedApp()),
      ),
    ).toEqual({
      added: [],
      removed: [],
      changed: [
        "binding Book@1 → Book@2",
        "binding updateBook@1 → updateBook@2",
        "element table",
        "element editForm",
      ],
    });
  });

  it("an app compared with itself, its keys in another order, has no difference", () => {
    const app = AppDraft.parse(createBookApp());
    const reordered = AppDraft.parse(JSON.parse(reverseKeys(app)));

    expect(diffApps(app, reordered)).toEqual({
      added: [],
      removed: [],
      changed: [],
    });
  });

  it("says what was removed, renamed and re-rooted", () => {
    const before = AppDraft.parse(createBookApp());
    const after = AppDraft.parse({
      ...createBookApp(),
      name: "Books",
      bindings: { types: [{ type: "Book", version: 1 }], actions: [] },
      ui: {
        root: "table",
        state: { status: { initial: "want" } },
        views: {},
        elements: { table: { component: "Table" } },
      },
    });

    expect(diffApps(before, after)).toEqual({
      added: [],
      removed: [
        "binding createBook@1",
        "binding updateBook@1",
        "element page",
        "element statusFilter",
        "element addForm",
        "element editForm",
        "view books",
        "state selected",
        "state editing",
      ],
      changed: [
        "name Books I'm reading → Books",
        "root page → table",
        "element table",
        "state status",
      ],
    });
  });
});

/** The app as JSON with every object's keys in the reverse order. */
function reverseKeys(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) {
      return inner;
    }

    return Object.fromEntries(Object.entries(inner).reverse());
  });
}
