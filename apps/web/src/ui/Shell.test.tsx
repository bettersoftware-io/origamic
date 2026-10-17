import { describe, expect, it } from "vitest";

import { mountShell } from "./Shell.page.tsx";

describe("the shell", () => {
  it("shows the sign-in until someone signs in, then the builder beside the workspace", async () => {
    const page = mountShell();

    expect(page.signingIn()).toBe(true);

    await page.signUp();

    expect(page.signingIn()).toBe(false);
    expect(page.signedInAs()).toBe("builder@origamic.test");
    expect(page.target()).toBe("A new app");
  });

  it("the builder makes the book tracker, adds two books, and revises it", async () => {
    const page = mountShell();

    await page.signUp();
    await page.ask(BOOK_TRACKER);

    expect(page.changes()).toContain(
      "Book: add type with title, author, status, rating",
    );

    await page.accept();

    expect(await page.caption("books")).toBe("Books I'm reading · version 1");
    expect(page.target()).toBe("Revising Books I'm reading, version 1");

    await page.addBook("books", "Dune");
    await page.addBook("books", "Emma");
    await page.ask("add a 'date finished' field");
    await page.accept();

    expect(await page.caption("books")).toBe("Books I'm reading · version 2");
    expect(await page.bookTitles("books")).toEqual(["Dune", "Emma"]);
    expect(page.cellsOf("books", "Dune")).toEqual(["Dune", "", "want", "", ""]);
  });

  it("turns the builder to a new app while a panel is active, and back", async () => {
    const page = mountShell();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    await page.accept();
    await page.caption("books");
    await page.newAppInstead();

    expect(page.target()).toBe("A new app");

    await page.reviseInstead();

    expect(page.target()).toBe("Revising Books I'm reading, version 1");
  });

  it("does not let the builder sign out while an accept is being saved", async () => {
    const page = mountShell();

    await page.signUp();
    await page.ask(BOOK_TRACKER);
    page.holdAccept();
    await page.startAccept();

    expect(page.canSignOut()).toBe(false);

    await page.releaseAccept();

    expect(page.canSignOut()).toBe(true);
    expect(await page.caption("books")).toBe("Books I'm reading · version 1");
  });

  it("signs out back to the sign-in", async () => {
    const page = mountShell();

    await page.signUp();
    await page.signOut();

    expect(page.signingIn()).toBe(true);
  });
});

const BOOK_TRACKER =
  "a simple tracker for the books I'm reading, with title, author, status (want / reading / done) and a rating";
