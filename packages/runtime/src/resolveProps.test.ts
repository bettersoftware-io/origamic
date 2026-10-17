import { describe, expect, it } from "vitest";

import { Element, type PropKind } from "@origamic/spec";

import type { AppSnapshot } from "./appSnapshot.ts";
import { resolveProps } from "./resolveProps.ts";

describe("resolving an element's props by kind", () => {
  it("gives a view prop the rows of the view it names", () => {
    const element = Element.parse({
      component: "Table",
      props: { rows: { $view: "books" } },
    });

    expect(resolveProps(element, createKinds(), createSnapshot())).toEqual({
      rows: [{ id: "dune", values: { title: "Dune" } }],
    });
  });

  it("gives a state prop the value of the state key it names, or the value it holds", () => {
    const element = Element.parse({
      component: "Table",
      props: { selected: { $state: "selected" }, label: "Books" },
    });

    expect(resolveProps(element, createKinds(), createSnapshot())).toEqual({
      selected: "dune",
      label: "Books",
    });
  });

  it("gives a state prop whose key holds nothing null", () => {
    const element = Element.parse({
      component: "Table",
      props: { selected: { $state: "editing" } },
    });

    expect(resolveProps(element, createKinds(), createSnapshot())).toEqual({
      selected: null,
    });
  });

  it("gives a fixed prop the value it holds", () => {
    const element = Element.parse({
      component: "Table",
      props: { columns: [{ property: "title", label: "Title" }] },
    });

    expect(resolveProps(element, createKinds(), createSnapshot())).toEqual({
      columns: [{ property: "title", label: "Title" }],
    });
  });

  it("hands on as written a view prop that names no view it read, and a prop of no kind", () => {
    const element = Element.parse({
      component: "Table",
      props: { rows: [], tone: "loud" },
    });

    expect(resolveProps(element, createKinds(), createSnapshot())).toEqual({
      rows: [],
      tone: "loud",
    });
  });
});

/** A Table's props by kind, with a state prop `label` for the literal case. */
function createKinds(): Record<string, PropKind> {
  return { rows: "view", columns: "fixed", selected: "state", label: "state" };
}

function createSnapshot(): AppSnapshot {
  return {
    state: { selected: "dune", status: "done" },
    rows: { books: [{ id: "dune", values: { title: "Dune" } }] },
    problems: {},
  };
}
