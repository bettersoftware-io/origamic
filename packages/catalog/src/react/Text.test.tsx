import { describe, expect, it } from "vitest";

import { mountText } from "./Text.page.tsx";

describe("a Text", () => {
  it("renders its text", () => {
    expect(mountText({ text: "Books I'm reading" }).text()).toBe(
      "Books I'm reading",
    );
  });

  it("is a heading in the heading tone, and a paragraph otherwise", () => {
    expect(mountText({ text: "Books", tone: "heading" }).isHeading()).toBe(
      true,
    );
    expect(mountText({ text: "Books", tone: "muted" }).isHeading()).toBe(false);
    expect(mountText({ text: "Books" }).tone()).toBe("body");
  });
});
