import { describe, expect, it } from "vitest";

import {
  AppView,
  catalog,
  createShellViewModel,
  elementTestId,
} from "./index.ts";

describe("the runtime's entry", () => {
  it("gives an element the test id spec.<its id>", () => {
    expect(elementTestId("table")).toBe("spec.table");
  });

  it("hands the composition root the catalog that apps are checked against, the view and the view model", () => {
    expect(Object.keys(catalog.manifest)).toEqual([
      "Stack",
      "Text",
      "Select",
      "Table",
      "Form",
    ]);
    expect(AppView).toBeTypeOf("function");
    expect(createShellViewModel).toBeTypeOf("function");
  });
});
