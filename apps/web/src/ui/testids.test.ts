import { describe, expect, it } from "vitest";

import { elementTestId } from "@origamic/runtime";

import {
  libraryEntryTestId,
  panelTestId,
  SPEC_PARTS,
  specElementTestId,
  specPartTestId,
} from "./testids.ts";

describe("the shell's test ids", () => {
  it("name an element of an app's spec as the runtime does", () => {
    for (const id of ["x", "table", "addForm"]) {
      expect(specElementTestId(id)).toBe(elementTestId(id));
    }
  });

  it("name a part of an element after the element, a dot before each part", () => {
    expect(specPartTestId("table", SPEC_PARTS.row, "book-1")).toBe(
      `${elementTestId("table")}.row.book-1`,
    );
    expect(specPartTestId("addForm", SPEC_PARTS.submit)).toBe(
      "spec.addForm.submit",
    );
  });

  it("name a panel and a library's entry by their ids", () => {
    expect(panelTestId("books")).toBe("panel.books");
    expect(libraryEntryTestId("books")).toBe("library.entry.books");
  });
});
