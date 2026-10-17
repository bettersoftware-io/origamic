import { describe, expect, it } from "vitest";

import { implementations, partTestId } from "./index.ts";
import { contracts } from "./manifest.ts";

describe("the catalog's React side", () => {
  it("implements each contract, under its name", () => {
    expect(Object.keys(implementations)).toEqual(Object.keys(contracts));
  });

  it("gives a part of an element the element's test id, then the part", () => {
    expect(partTestId("spec.table", "row")).toBe("spec.table.row");
  });
});
