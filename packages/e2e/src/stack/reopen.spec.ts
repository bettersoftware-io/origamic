import { randomUUID } from "node:crypto";

import { expect, test } from "#/testing/test.ts";

test.describe("the workspace, on a local Supabase", () => {
  test("after a reload the workspace shows the same panel with the same app version", async ({
    shell,
    specApp,
  }) => {
    // A builder of their own: the database is shared, and outlives the run.
    const email = `reopen-${randomUUID()}@origamic.test`;

    await shell.open();
    await shell.signUp(email, PASSWORD);
    await shell.ask(BOOK_TRACKER);
    await shell.accept();
    await specApp.addBook("books", "Dune");

    await shell.reload();
    await shell.signInIfAsked(email, PASSWORD);

    await expect
      .poll(() => {
        return shell.caption("books");
      })
      .toBe("Books I'm reading · version 1");
    await expect
      .poll(() => {
        return specApp.books("books");
      })
      .toEqual([{ title: "Dune", cells: ["Dune", "", "want", ""] }]);
  });
});

const PASSWORD = "a-long-password-1";
const BOOK_TRACKER =
  "a simple tracker for the books I'm reading, with title, author, status (want / reading / done) and a rating";
