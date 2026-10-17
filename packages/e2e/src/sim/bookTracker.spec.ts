import { expect, test } from "#/testing/test.ts";

test.describe("the first slice's loop, on the simulators", () => {
  test("the builder makes the book tracker, adds two books, and revises it", async ({
    shell,
    specApp,
  }) => {
    await shell.open();
    await shell.signUp("builder@origamic.test", "a-long-password-1");

    await shell.ask(BOOK_TRACKER);
    expect(await shell.proposedChanges()).toContain(
      "Book: add type with title, author, status, rating",
    );
    await shell.accept();
    await expect
      .poll(() => {
        return shell.caption("books");
      })
      .toBe("Books I'm reading · version 1");

    await specApp.addBook("books", "Dune");
    await specApp.addBook("books", "Emma");

    await shell.ask("add a 'date finished' field");
    await shell.accept();
    await expect
      .poll(() => {
        return shell.caption("books");
      })
      .toBe("Books I'm reading · version 2");
    await expect
      .poll(() => {
        return specApp.books("books");
      })
      .toEqual([
        { title: "Dune", cells: ["Dune", "", "want", "", ""] },
        { title: "Emma", cells: ["Emma", "", "want", "", ""] },
      ]);

    // The old version is still in the library: it opens beside the new one,
    // with both books and no column for the date.
    await shell.openFromLibrary("books", 1);
    await expect
      .poll(() => {
        return shell.caption("books-2");
      })
      .toBe("Books I'm reading · version 1");
    await expect
      .poll(() => {
        return specApp.books("books-2");
      })
      .toEqual([
        { title: "Dune", cells: ["Dune", "", "want", ""] },
        { title: "Emma", cells: ["Emma", "", "want", ""] },
      ]);
  });
});

const BOOK_TRACKER =
  "a simple tracker for the books I'm reading, with title, author, status (want / reading / done) and a rating";
