import { describe, expect, it } from "vitest";

import { mountSelect } from "./Select.page.tsx";

describe("a Select", () => {
  it('emits { value: "done" } when "done" is chosen', async () => {
    const page = mountSelect({ emptyLabel: "Every status" });

    await page.choose("done");

    expect(page.emitted()).toEqual([
      { event: "change", payload: { value: "done" } },
    ]);
  });

  it("emits { value: null } when the empty label is chosen", async () => {
    const page = mountSelect({ emptyLabel: "Every status", value: "done" });

    await page.choose("Every status");

    expect(page.emitted()).toEqual([
      { event: "change", payload: { value: null } },
    ]);
  });

  it("shows the value it holds, the empty label for null, and its label when nothing is chosen", () => {
    expect(mountSelect({ value: "reading" }).shown()).toBe("reading");
    expect(mountSelect({ emptyLabel: "Every status" }).shown()).toBe(
      "Every status",
    );
    expect(mountSelect({}).shown()).toBe("Status");
  });

  it("offers no empty choice without an empty label", async () => {
    const page = mountSelect({});

    expect(await page.offered()).toEqual(["want", "reading", "done"]);
  });
});
