import { describe, expect, it } from "vitest";

import { mountForm } from "./Form.page.tsx";

describe("a Form", () => {
  it("emits a number from a number field, and leaves an empty field out", async () => {
    const page = mountForm({ mode: "create" });

    await page.fill("title", "Dune");
    await page.fill("rating", "4");
    await page.submit();

    expect(page.emitted()).toEqual([
      {
        event: "submit",
        payload: { title: "Dune", reading: false, rating: 4 },
      },
    ]);
  });

  it('shows "Select a row to edit" in mode "edit" while values is null, and submits nothing', async () => {
    const page = mountForm({ mode: "edit", values: null });

    expect(page.notice()).toBe("Select a row to edit");

    await page.submit();

    expect(page.emitted()).toEqual([]);
  });

  it("shows a problem with path title beside the title field", () => {
    const page = mountForm({
      mode: "create",
      problems: [
        { path: "title", message: "a book needs a title" },
        { path: "", message: "the book could not be saved" },
      ],
    });

    expect(page.problemsBeside("title")).toEqual(["a book needs a title"]);
    expect(page.problemsBeside("rating")).toEqual([]);
    expect(page.problemsOfTheForm()).toEqual(["the book could not be saved"]);
  });

  it("emits what each kind of field holds", async () => {
    const page = mountForm({ mode: "create" });

    await page.fill("title", "Emma");
    await page.fill("notes", "A reread.");
    await page.fill("dateFinished", "2026-09-30");
    await page.choose("status", "reading");
    await page.check("reading");
    await page.submit();

    expect(page.emitted()).toEqual([
      {
        event: "submit",
        payload: {
          title: "Emma",
          notes: "A reread.",
          status: "reading",
          dateFinished: "2026-09-30",
          reading: true,
        },
      },
    ]);
  });

  it('shows the values it edits in mode "edit", and emits them with what was changed', async () => {
    const page = mountForm({
      mode: "edit",
      values: { title: "Dune", status: "done", rating: 5, reading: true },
    });

    expect(page.notice()).toBeNull();
    expect(page.shown("title")).toBe("Dune");
    expect(page.shown("status")).toBe("done");
    expect(page.shown("rating")).toBe("5");

    await page.fill("rating", "4");
    await page.submit();

    expect(page.emitted()).toEqual([
      {
        event: "submit",
        payload: {
          title: "Dune",
          status: "done",
          rating: 4,
          reading: true,
        },
      },
    ]);
  });

  it("shows the next values it is given to edit", () => {
    const page = mountForm({ mode: "edit", values: { title: "Dune" } });

    page.edit({ title: "Emma" });

    expect(page.shown("title")).toBe("Emma");
  });
});
