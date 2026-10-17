import { describe, expect, it } from "vitest";

import { mountChecked } from "./checked.page.tsx";

describe("a component behind its contract", () => {
  it("is drawn with the props its contract accepts", () => {
    const page = mountChecked({ text: "Reading", tone: "heading" });

    expect(page.text()).toBe("Reading");
    expect(page.misfits()).toEqual([]);
  });

  it("shows what does not fit in its place, prop by prop", () => {
    const page = mountChecked({ text: 3, tone: "loud" });

    expect(page.text()).toBeNull();
    expect(page.misfits()).toEqual([
      expect.stringMatching(/^text: .*string/),
      expect.stringMatching(/^tone: .*"heading"/),
    ]);
  });

  it("names a required prop that is missing, and lets an optional one be left out", () => {
    const page = mountChecked({ tone: undefined });

    expect(page.misfits()).toEqual(['text: a "Text" needs "text"']);
  });
});
