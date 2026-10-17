import { firstValueFrom } from "rxjs";
import { afterAll, describe, expect, it } from "vitest";

import {
  createAppDraft,
  createWorkspaceDraft,
} from "@origamic/core/ports/__contracts__/fixtures.ts";
import { describeSpecLibraryPortContract } from "@origamic/core/ports/__contracts__/SpecLibraryPortContract.ts";

import { createOwners, type Owner } from "#/testing/owners.ts";

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

describe("the Supabase library, against the database", () => {
  it("a second owner lists none of the first's apps or workspaces", async () => {
    const first = await owners.create();
    const second = await owners.create();

    await first.adapters.library.saveApp(
      createAppDraft("books", "Books I'm reading"),
    );
    await first.adapters.library.saveWorkspace(createWorkspaceDraft(1));

    expect(await firstValueFrom(second.adapters.library.apps())).toEqual([]);
    expect(await firstValueFrom(second.adapters.library.workspaces())).toEqual(
      [],
    );
    expect(await second.adapters.library.loadApp("books")).toBeNull();
    expect(await firstValueFrom(first.adapters.library.apps())).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);
  });

  it("a row whose spec has another id is an error, saying which", async () => {
    const owner = await owners.create();

    await writeRow(owner, "apps", "books", 1, {
      ...createAppDraft("films", "Films"),
      version: 1,
    });

    const said =
      'the row "books" at version 1 in apps holds "films" at version 1';

    await expect(owner.adapters.library.loadApp("books")).rejects.toThrow(said);
    await expect(firstValueFrom(owner.adapters.library.apps())).rejects.toThrow(
      said,
    );
  });

  it("a row whose spec has another version is an error, saying which", async () => {
    const owner = await owners.create();

    await writeRow(owner, "workspaces", "reading", 3, {
      ...createWorkspaceDraft(1),
      version: 1,
    });

    await expect(
      owner.adapters.library.loadWorkspace("reading"),
    ).rejects.toThrow(
      'the row "reading" at version 3 in workspaces holds "reading" at version 1',
    );
  });
});

/** A row written as the service role, its spec as it is: what a client that bypassed the library could leave. */
async function writeRow(
  owner: Owner,
  kind: "apps" | "workspaces",
  id: string,
  version: number,
  spec: unknown,
): Promise<void> {
  const { error } = await owners.admin
    .from(kind)
    .insert({ owner: owner.id, id, version, spec });

  if (error) {
    throw error;
  }
}
