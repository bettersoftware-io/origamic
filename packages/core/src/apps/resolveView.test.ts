import { describe, expect, it } from "vitest";

import { View } from "@origamic/spec";

import { resolveView } from "./resolveView.ts";

describe("resolveView", () => {
  it("leaves out a filter on a state key holding null: that is every status", () => {
    const query = resolveView(createStatusView(), { status: null });

    expect(query.filter).toEqual([]);
  });

  it("a filter on a state key holding a value compares with that value", () => {
    const query = resolveView(createStatusView(), { status: "done" });

    expect(query.filter).toEqual([
      { property: "status", op: "eq", value: "done" },
    ]);
  });

  it("a state key the state does not hold reads as null, and its filter is left out", () => {
    const query = resolveView(createStatusView(), {});

    expect(query.filter).toEqual([]);
  });

  it("a key every object inherits is not a state key", () => {
    const view = View.parse({
      type: "Book",
      filter: [
        { property: "title", op: "eq", value: { $state: "constructor" } },
      ],
    });

    expect(resolveView(view, {}).filter).toEqual([]);
  });

  it("a literal filter is kept, a literal null too", () => {
    const view = View.parse({
      type: "Book",
      filter: [
        { property: "rating", op: "gt", value: 3 },
        { property: "author", op: "eq", value: null },
      ],
    });

    expect(resolveView(view, {}).filter).toEqual([
      { property: "rating", op: "gt", value: 3 },
      { property: "author", op: "eq", value: null },
    ]);
  });

  it("the type, the sort and the limit pass through", () => {
    const view = View.parse({
      type: "Book",
      sort: [
        { property: "rating", dir: "desc" },
        { property: "title", dir: "asc" },
      ],
      limit: 10,
    });

    expect(resolveView(view, {})).toEqual({
      type: "Book",
      filter: [],
      sort: [
        { property: "rating", dir: "desc" },
        { property: "title", dir: "asc" },
      ],
      limit: 10,
    });
  });

  it("a view with no limit gives a query with none", () => {
    expect(resolveView(createStatusView(), {})).not.toHaveProperty("limit");
  });
});

function createStatusView(): View {
  return View.parse({
    type: "Book",
    filter: [{ property: "status", op: "eq", value: { $state: "status" } }],
    sort: [{ property: "title", dir: "asc" }],
  });
}
