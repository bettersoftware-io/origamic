import { describe, expect, it } from "vitest";

import type { Row } from "#/contract/props.ts";

import { mountTable } from "./Table.page.tsx";

describe("a Table", () => {
  it("renders a row per Row, with its columns", () => {
    const page = mountTable({ rows: createBooks() });

    expect(page.headings()).toEqual(["Title", "Status", "Rating", "Finished"]);
    expect(page.rowIds()).toEqual(["b1", "b2"]);
    expect(page.cellsOf("b1")).toEqual(["Dune", "done", "5", "2026-09-30"]);
  });

  it("shows nothing for a value a row does not have, or holds as null", () => {
    const page = mountTable({ rows: createBooks() });

    expect(page.cellsOf("b2")).toEqual(["Emma", "want", "", ""]);
  });

  it("emits { id, values } when a row is clicked", async () => {
    const page = mountTable({ rows: createBooks() });

    await page.clickRow("b2");

    expect(page.emitted()).toEqual([
      {
        event: "select",
        payload: {
          id: "b2",
          values: { title: "Emma", status: "want", rating: null },
        },
      },
    ]);
  });

  it("marks the selected row", () => {
    expect(
      mountTable({ rows: createBooks(), selected: "b2" }).selectedRowIds(),
    ).toEqual(["b2"]);
    expect(
      mountTable({ rows: createBooks(), selected: null }).selectedRowIds(),
    ).toEqual([]);
  });

  it("shows a value that is not text as JSON", () => {
    const page = mountTable({
      rows: [{ id: "b3", values: { title: "Ulysses", status: ["a"] } }],
    });

    expect(page.cellsOf("b3")).toEqual(["Ulysses", '["a"]', "", ""]);
  });
});

function createBooks(): Row[] {
  return [
    {
      id: "b1",
      values: {
        title: "Dune",
        status: "done",
        rating: 5,
        dateFinished: "2026-09-30",
      },
    },
    { id: "b2", values: { title: "Emma", status: "want", rating: null } },
  ];
}
