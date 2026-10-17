import { describe, expect, it } from "vitest";

import { mountLibrary } from "./Library.page.tsx";

describe("the library", () => {
  it("says it has no app before one is saved", () => {
    const page = mountLibrary();

    expect(page.empty()).toBe("No app saved yet.");
    expect(page.entries()).toEqual([]);
  });

  it("lists each saved app at its latest version", async () => {
    const page = mountLibrary();

    await page.saveBookTracker();

    expect(page.entries()).toEqual(["Books I'm reading version 1"]);
    expect(page.empty()).toBeNull();
  });

  it("opens an app in a new panel of the workspace, at its latest version", async () => {
    const page = mountLibrary();

    await page.saveBookTracker();
    await page.open("books");

    expect(page.workspace()?.panels).toEqual({
      books: { app: "books", appVersion: 1 },
    });
    expect(page.problem()).toBeNull();
  });

  it("opens an older version of an app, which the library keeps", async () => {
    const page = mountLibrary();

    await page.saveBookTracker();
    await page.saveNextVersion();

    expect(page.entries()).toEqual(["Books I'm reading version 2"]);

    await page.open("books", 1);

    expect(page.workspace()?.panels).toEqual({
      books: { app: "books", appVersion: 1 },
    });
  });

  it("opens the latest version after a new one is saved, the version left as it was offered", async () => {
    const page = mountLibrary();

    await page.saveBookTracker();
    await page.saveNextVersion();
    await page.open("books");

    expect(page.workspace()?.panels).toEqual({
      books: { app: "books", appVersion: 2 },
    });
  });

  it("says why an app could not be opened", async () => {
    const page = mountLibrary();

    await page.saveBookTracker();
    page.loseApps();
    await page.open("books");

    expect(page.problem()).toBe('The library has no app "books" at version 1.');
    expect(page.workspace()?.panels).toEqual({});
  });
});
