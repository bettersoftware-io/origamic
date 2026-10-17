import { describe, expect, it } from "vitest";

import { mountBuilder } from "./Builder.page.tsx";

describe("the builder", () => {
  it("asks the model for a new app, and shows the proposal's change set and the app's diff", async () => {
    const page = mountBuilder();

    await page.signUp();
    expect(page.target()).toBe("A new app");

    await page.ask(BOOK_TRACKER);

    expect(page.changes()).toContain(
      "Book: add type with title, author, status, rating",
    );
    expect(page.diff()).toContain("+ element table");
  });

  it("accepting saves the app at version 1 and opens it in a panel", async () => {
    const page = mountBuilder();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.accept();

    expect(page.library()).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);
    expect(page.workspace()?.panels).toEqual({
      books: { app: "books", appVersion: 1 },
    });
    expect(page.proposes()).toBe(false);
  });

  it("rejecting drops the proposal and saves nothing", async () => {
    const page = mountBuilder();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.reject();

    expect(page.proposes()).toBe(false);
    expect(page.library()).toEqual([]);
  });

  it("revises the app of the active panel, and accepting moves the panel to the version it saves", async () => {
    const page = mountBuilder();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.accept();
    page.activate("books");

    expect(page.target()).toBe("Revising Books I'm reading, version 1");

    await page.ask("add a 'date finished' field");

    expect(page.changes()).toEqual([
      "Book: add dateFinished (date, optional)",
      expect.stringContaining("updateBook"),
    ]);
    expect(page.diff()).toContain("~ binding Book@1 → Book@2");

    await page.accept();

    expect(page.workspace()?.panels).toEqual({
      books: { app: "books", appVersion: 2 },
    });
    expect(page.target()).toBe("Revising Books I'm reading, version 2");
  });

  it("turns from the active panel to a new app, and back", async () => {
    const page = mountBuilder();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.accept();
    page.activate("books");
    await page.newAppInstead();

    expect(page.target()).toBe("A new app");

    await page.reviseInstead();

    expect(page.target()).toBe("Revising Books I'm reading, version 1");
  });

  it("works on a new app when the active panel is not in the workspace", async () => {
    const page = mountBuilder();

    await page.signUp();
    page.activate("films");

    expect(page.target()).toBe("A new app");

    await page.ask(BOOK_TRACKER);

    expect(page.changes()).toContain(
      "Book: add type with title, author, status, rating",
    );
  });

  it("says why it asked nothing when the library no longer has the active panel's app", async () => {
    const page = mountBuilder();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.accept();
    page.activate("books");
    page.loseApps();
    await page.ask("add a 'date finished' field");

    expect(page.refused()).toBe(
      "The library has no books at version 1 to revise.",
    );
  });

  it("says why the model gave no proposal", async () => {
    const page = mountBuilder();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.reject();
    await page.ask(BOOK_TRACKER);
    await page.reject();
    await page.ask(BOOK_TRACKER);

    expect(page.failure()).toBe(
      "The simulator has no scripted reply left for this request.",
    );
  });

  it("says why an accept saved nothing", async () => {
    const page = mountBuilder();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.reject();
    // The model's second reply is a revision, asked for here as a new app on
    // an ontology it was not written against.
    await page.ask(BOOK_TRACKER);
    await page.accept();

    expect(page.failure()).toBe(
      "Nothing was saved: the ontology changed since this proposal was made. Ask again.",
    );
  });

  it("says why the model's app was refused, with each problem", async () => {
    const page = mountBuilder();

    await page.signUp();
    page.modelFails("The model's app did not check, twice.", [
      { path: "ui.elements.table", message: 'no component "Grid"' },
      { path: "", message: "the app has no root" },
    ]);
    await page.ask(BOOK_TRACKER);

    expect(page.failure()).toBe(
      [
        "The model's app did not check, twice.",
        'ui.elements.table: no component "Grid"',
        "the app has no root",
      ].join("\n"),
    );
  });

  it("says it is asking the model until the model answers", async () => {
    const page = mountBuilder();

    await page.signUp();

    expect(await page.progressOnAsking(BOOK_TRACKER)).toEqual([
      "Asking the model…",
    ]);
  });
});

const BOOK_TRACKER =
  "a simple tracker for the books I'm reading, with title, author, status (want / reading / done) and a rating";
