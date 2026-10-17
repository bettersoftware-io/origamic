import { describe, expect, it } from "vitest";

import { mountErrorBoundary } from "./ErrorBoundary.page.tsx";

describe("the shell's error boundary", () => {
  it("draws what it holds while it can", () => {
    const page = mountErrorBoundary();

    expect(page.showsChild()).toBe(true);
    expect(page.failure()).toBeNull();
  });

  it("says why in place of what it holds, when that fails to draw", () => {
    const page = mountErrorBoundary({ fails: "reading the apps failed" });

    expect(page.showsChild()).toBe(false);
    expect(page.failure()).toBe(
      "Origamic stopped: reading the apps failed. Reload the page to start again.",
    );
  });
});
