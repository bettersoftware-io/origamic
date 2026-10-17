import { describe, expect, it } from "vitest";

import { mountStack } from "./Stack.page.tsx";

describe("a Stack", () => {
  it("renders its children in order", () => {
    const page = mountStack({ children: ["Filter", "Books", "Add a book"] });

    expect(page.children()).toEqual(["Filter", "Books", "Add a book"]);
  });

  it("spaces its children by its gap, medium when it names none", () => {
    expect(mountStack({ children: [], gap: "large" }).gap()).toBe("large");
    expect(mountStack({ children: [] }).gap()).toBe("medium");
  });
});
