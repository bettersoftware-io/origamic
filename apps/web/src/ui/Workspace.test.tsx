import { describe, expect, it } from "vitest";

import { mountWorkspace } from "./Workspace.page.tsx";

describe("the workspace", () => {
  it("says it is opening until the builder signs in, then that no panel is open", async () => {
    const page = mountWorkspace();

    expect(page.notice()).toBe("Opening your workspace…");

    await page.signUp();

    expect(page.notice()).toBe(
      "No panel open. Ask the builder for an app, or open one from the library.",
    );
    expect(page.panels()).toEqual([]);
  });

  it("shows a panel for an app it opens, with the app at the version it pins, and makes it active", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();

    expect(page.panels()).toEqual(["books"]);
    expect(await page.caption("books")).toBe("Books I'm reading · version 1");
    expect(await page.bookTitles("books")).toEqual([]);
    expect(page.notice()).toBeNull();
    expect(page.activated()).toContain("books");
  });

  it("draws the app's elements with the test ids the runtime gives them", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();
    await page.addBook("books", "Dune");

    expect(page.cellsOf("books", "Dune")).toEqual(["Dune", "", "want", ""]);
  });

  it("moves the panel to the next version of its app, keeping its books, which show no date", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();
    await page.addBook("books", "Dune");
    await page.addBook("books", "Emma");
    await page.reviseToDateFinished("books");

    expect(await page.caption("books")).toBe("Books I'm reading · version 2");
    expect(await page.bookTitles("books")).toEqual(["Dune", "Emma"]);
    expect(page.cellsOf("books", "Emma")).toEqual(["Emma", "", "want", "", ""]);
  });

  it("says why the workspace could not be opened", async () => {
    const page = mountWorkspace();

    page.failOpening("the library cannot be reached");
    await page.signUp();

    expect(page.notice()).toBe(
      "Your workspace could not be opened: the library cannot be reached",
    );
  });

  it("opens a second panel of an app beside the first, each at its version", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();
    await page.openSaved();

    expect(page.panels().sort()).toEqual(["books", "books-2"]);
    expect(await page.caption("books-2")).toBe("Books I'm reading · version 1");
    expect(page.saved()?.layout).toMatchObject({
      kind: "split",
      direction: "row",
    });
  });

  it("closes a panel from its tab, and saves the workspace without it", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();
    await page.caption("books");
    await page.closeFromTab("Books I'm reading v1");

    expect(page.panels()).toEqual([]);
    expect(page.saved()).toMatchObject({ panels: {}, layout: null });
  });

  it("takes away a panel the workspace closed elsewhere, and leaves the others", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();
    await page.openSaved();
    await page.caption("books-2");
    await page.closeElsewhere("books");

    expect(page.panels()).toEqual(["books-2"]);
    expect(page.saved()?.panels).toEqual({
      "books-2": { app: "books", appVersion: 1 },
    });
  });

  it("shows the compatibility report in place of an app that no longer fits the ontology", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.saveBookTracker();
    await page.dropRating();
    await page.openSaved();

    expect(await page.compatibility("books")).toContain(
      "createBook@1: rating is no longer set",
    );
  });

  it("says which binding is missing when the app is ahead of the ontology", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.saveBookTracker();
    await page.saveRevisionAhead();
    await page.openSaved();

    expect(await page.compatibility("books")).toContain("Book@2 is missing");
  });

  it("says why the panel's app could not be read", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.saveBookTracker();
    page.failLoading("the library cannot be reached");
    await page.openSaved();

    expect(await page.panelNotice("books")).toBe(
      "The app could not be read: the library cannot be reached",
    );
  });

  it("names a panel by its app's id when the library has no such app", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();
    await page.pinUnknownApp("books");

    expect(await page.panelNotice("books")).toBe(
      "The library has no films at version 1.",
    );
    expect(page.tabTitles()).toEqual(["films v1"]);
  });

  it("says so in the panel when the library has no app at the version it pins", async () => {
    const page = mountWorkspace();

    await page.signUp();
    await page.openBookTracker();
    await page.pinMissingVersion("books");

    expect(await page.panelNotice("books")).toBe(
      "The library has no books at version 9.",
    );
  });
});
