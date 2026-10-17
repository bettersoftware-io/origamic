import { describe, expect, it } from "vitest";

import { toDockviewSteps } from "./dockviewSteps.ts";

describe("translating a workspace's layout to dockview", () => {
  it("adds a lone panel with its title, and nothing beside it", () => {
    expect(toDockviewSteps({ kind: "panel", panel: "books" }, TITLES)).toEqual([
      { panel: "books", title: "Books I'm reading v1" },
    ]);
  });

  it("adds a split of two side by side, the second to the right of the first", () => {
    expect(
      toDockviewSteps(
        {
          kind: "split",
          direction: "row",
          parts: [
            { size: 1, layout: { kind: "panel", panel: "books" } },
            { size: 1, layout: { kind: "panel", panel: "notes" } },
          ],
        },
        TITLES,
      ),
    ).toEqual([
      { panel: "books", title: "Books I'm reading v1" },
      {
        panel: "notes",
        title: "Notes v3",
        position: { referencePanel: "books", direction: "right" },
      },
    ]);
  });

  it("adds tabs within the group of the first", () => {
    expect(
      toDockviewSteps(
        { kind: "tabs", panels: ["books", "notes"], active: "notes" },
        TITLES,
      ),
    ).toEqual([
      { panel: "books", title: "Books I'm reading v1" },
      {
        panel: "notes",
        title: "Notes v3",
        position: { referencePanel: "books", direction: "within" },
      },
    ]);
  });

  it("lays out a split before what is inside its parts, so a column stays a column beside the next part", () => {
    expect(
      toDockviewSteps(
        {
          kind: "split",
          direction: "row",
          parts: [
            {
              size: 2,
              layout: {
                kind: "split",
                direction: "column",
                parts: [
                  { size: 1, layout: { kind: "panel", panel: "books" } },
                  {
                    size: 1,
                    layout: {
                      kind: "tabs",
                      panels: ["notes", "films"],
                      active: "notes",
                    },
                  },
                ],
              },
            },
            { size: 1, layout: { kind: "panel", panel: "plants" } },
          ],
        },
        TITLES,
      ),
    ).toEqual([
      { panel: "books", title: "Books I'm reading v1" },
      {
        panel: "plants",
        title: "plants",
        position: { referencePanel: "books", direction: "right" },
      },
      {
        panel: "notes",
        title: "Notes v3",
        position: { referencePanel: "books", direction: "below" },
      },
      {
        panel: "films",
        title: "films",
        position: { referencePanel: "notes", direction: "within" },
      },
    ]);
  });

  it("names a panel by its id when it has no title, and never by a name every object inherits", () => {
    expect(
      toDockviewSteps({ kind: "panel", panel: "constructor" }, TITLES),
    ).toEqual([{ panel: "constructor", title: "constructor" }]);
  });
});

const TITLES: Readonly<Record<string, string>> = {
  books: "Books I'm reading v1",
  notes: "Notes v3",
};
