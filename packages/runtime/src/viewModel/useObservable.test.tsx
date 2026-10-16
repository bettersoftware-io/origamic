import { describe, expect, it, onTestFinished, vi } from "vitest";

import { mountWatcher } from "./useObservable.page.tsx";

describe("useObservable", () => {
  it("gives the initial value until the observable emits, then its latest", async () => {
    const page = mountWatcher("prices");

    expect(page.shown()).toBe("nothing yet");

    await page.emit("prices", "1.10");
    await page.emit("prices", "1.11");

    expect(page.shown()).toBe("1.11");
  });

  it("opens the observable afresh when an argument changes, and closes the one before", async () => {
    const page = mountWatcher("prices");

    await page.watch("rates");

    expect(page.isOpen("prices")).toBe(false);
    expect(page.isOpen("rates")).toBe(true);

    await page.emit("rates", "4.5");

    expect(page.shown()).toBe("4.5");
  });

  it("gives the initial value again until the observable opened from new arguments emits, never the last one's value", async () => {
    const page = mountWatcher("prices");

    await page.emit("prices", "1.10");
    await page.watch("rates");

    expect(page.shown()).toBe("nothing yet");
  });

  it("closes the observable when the component unmounts", async () => {
    const page = mountWatcher("prices");

    await page.unmount();

    expect(page.isOpen("prices")).toBe(false);
  });

  it.each([
    ["an error", new Error("the feed is gone")],
    ["anything else", "the feed is gone"],
  ])(
    "throws what the observable fails with, %s, where the component renders",
    async (_kind, failure) => {
      // React prints the error it catches; the message is asserted below instead.
      const printed = vi.spyOn(console, "error").mockImplementation(() => {});

      onTestFinished(() => {
        printed.mockRestore();
      });

      const page = mountWatcher("prices");

      await expect(page.fail("prices", failure)).rejects.toThrow(
        "the feed is gone",
      );
    },
  );
});
