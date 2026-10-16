import { afterAll, describe, expect, it } from "vitest";

import { createAppDraft } from "@origamic/core/ports/__contracts__/fixtures.ts";
import { describeSpecLibraryPortContract } from "@origamic/core/ports/__contracts__/SpecLibraryPortContract.ts";

import { createOwners } from "#/testing/owners.ts";

const owners = createOwners();

afterAll(async () => {
  await owners.remove();
});

describeSpecLibraryPortContract("Supabase", async () => {
  const owner = await owners.create();

  return owner.adapters.library;
});

describe("saving an app twice at once", () => {
  it("gives each save a version of its own", async () => {
    const owner = await owners.create();
    const { library } = owner.adapters;

    const saved = await Promise.all([
      library.saveApp(createAppDraft("books", "Books I'm reading")),
      library.saveApp(createAppDraft("books", "Books I'm reading")),
      library.saveApp(createAppDraft("books", "Books I'm reading")),
    ]);

    expect(
      saved
        .map((app) => {
          return app.version;
        })
        .sort(),
    ).toEqual([1, 2, 3]);
    expect(await library.loadApp("books")).toMatchObject({ version: 3 });
  });
});
