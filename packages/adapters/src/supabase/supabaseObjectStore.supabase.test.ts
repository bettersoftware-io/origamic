import { firstValueFrom } from "rxjs";
import { afterAll, describe, expect, it } from "vitest";

import type { ActionInvocation, ActionResult, ViewQuery } from "@origamic/core";
import { createBookOntology } from "@origamic/core/ports/__contracts__/fixtures.ts";
import { describeObjectStorePortContract } from "@origamic/core/ports/__contracts__/ObjectStorePortContract.ts";
import { type JsonValue, Ontology } from "@origamic/spec";

import { createOwners, type Owner } from "#/testing/owners.ts";

const owners = createOwners();

afterAll(async () => {
  await owners.remove();
});

describeObjectStorePortContract("Supabase", async (initial) => {
  const owner = await owners.create();

  await owners.writeOntology(owner, initial.ontology);
  await owners.writeObjects(owner, initial.objects);

  return owner.adapters.objects;
});

describe("the Supabase object store, against the database", () => {
  it("an object and a link round-trip", async () => {
    const owner = await createOwnerWithAuthors();
    const book = idOf(
      await owner.adapters.objects.execute({
        action: "createBook",
        version: 1,
        input: { title: "Dune", rating: 5 },
      }),
    );

    const author = idOf(
      await owner.adapters.objects.execute({
        action: "createAuthor",
        version: 1,
        input: { name: "Frank Herbert" },
      }),
    );

    const linked = await owner.adapters.objects.execute(
      linkAuthor(author, book),
    );

    // Read back on adapters of their own: nothing is held in memory.
    const again = owners.createSignedOut();

    await again.session.signIn(owner.email, owner.password);

    const books = await firstValueFrom(again.objects.view(everyOf("Book")));
    const authors = await firstValueFrom(again.objects.view(everyOf("Author")));
    const links = await owners.admin
      .from("links")
      .select("owner, link_type, from_id, to_id, cardinality")
      .eq("owner", owner.id);
    const relinked = await again.objects.execute(linkAuthor(author, book));

    expect(linked).toEqual({ kind: "done", id: author });
    expect(books).toEqual([
      {
        id: book,
        type: "Book",
        typeVersion: 1,
        values: { title: "Dune", status: "want", rating: 5 },
      },
    ]);
    expect(authors).toEqual([
      {
        id: author,
        type: "Author",
        typeVersion: 1,
        values: { name: "Frank Herbert" },
      },
    ]);
    expect(links.data).toEqual([
      {
        owner: owner.id,
        link_type: "Wrote",
        from_id: author,
        to_id: book,
        cardinality: "one-to-many",
      },
    ]);
    expect(relinked).toMatchObject({ kind: "rejected" });
  });

  it("a second owner reads none of the first's objects through the store", async () => {
    const first = await createOwnerWithAuthors();
    const second = await createOwnerWithAuthors();
    const book = idOf(
      await first.adapters.objects.execute({
        action: "createBook",
        version: 1,
        input: { title: "Dune" },
      }),
    );

    const author = idOf(
      await second.adapters.objects.execute({
        action: "createAuthor",
        version: 1,
        input: { name: "Jane Austen" },
      }),
    );

    const seen = await firstValueFrom(
      second.adapters.objects.view(everyOf("Book")),
    );

    const updated = await second.adapters.objects.execute({
      action: "updateBook",
      version: 1,
      target: book,
      input: { title: "Emma" },
    });

    const linked = await second.adapters.objects.execute(
      linkAuthor(author, book),
    );

    expect(seen).toEqual([]);
    expect(updated).toMatchObject({
      kind: "rejected",
      problems: [{ path: "target" }],
    });
    expect(linked).toMatchObject({
      kind: "rejected",
      problems: [{ path: "to" }],
    });
    expect(
      await firstValueFrom(first.adapters.objects.view(everyOf("Book"))),
    ).toMatchObject([{ id: book, values: { title: "Dune" } }]);
  });

  it("an id that is not a UUID names no object", async () => {
    const owner = await createOwnerWithAuthors();

    const result = await owner.adapters.objects.execute({
      action: "updateBook",
      version: 1,
      target: "book-1",
      input: { title: "Dune" },
    });

    expect(result).toMatchObject({
      kind: "rejected",
      problems: [{ path: "target" }],
    });
  });

  it("a stored object whose values are not scalars fails the view, saying so", async () => {
    const nested = await owners.create();
    const listed = await owners.create();

    await writeBook(nested, { title: { text: "Dune" } });
    await writeBook(listed, ["Dune"]);

    await expect(
      firstValueFrom(nested.adapters.objects.view(everyOf("Book"))),
    ).rejects.toThrow('"title" holds a value that is not a scalar');
    await expect(
      firstValueFrom(listed.adapters.objects.view(everyOf("Book"))),
    ).rejects.toThrow("an object's values are a JSON object");
  });

  it("a view read signed out fails the stream, saying why", async () => {
    const adapters = owners.createSignedOut();

    const refused = firstValueFrom(adapters.objects.view(everyOf("Book")));

    await expect(refused).rejects.toThrow(/permission denied/);
  });
});

/** An owner whose ontology is the book tracker's, with authors who write books. */
async function createOwnerWithAuthors(): Promise<Owner> {
  const owner = await owners.create();
  const books = createBookOntology();

  await owners.writeOntology(
    owner,
    Ontology.parse({
      ...books,
      objectTypes: [
        ...books.objectTypes,
        {
          name: "Author",
          version: 1,
          titleProperty: "name",
          properties: [{ name: "name", type: "string", required: true }],
        },
      ],
      linkTypes: [
        {
          name: "Wrote",
          from: "Author",
          to: "Book",
          cardinality: "one-to-many",
        },
      ],
      actionTypes: [
        ...books.actionTypes,
        {
          name: "createAuthor",
          version: 1,
          kind: "create",
          type: "Author",
          fields: ["name"],
        },
        { name: "linkAuthor", version: 1, kind: "link", linkType: "Wrote" },
      ],
    }),
  );

  return owner;
}

/** A book written as the service role, with `data` as it is: what a client that bypassed the store could leave. */
async function writeBook(owner: Owner, data: JsonValue): Promise<void> {
  const { error } = await owners.admin
    .from("objects")
    .insert({ owner: owner.id, type: "Book", type_version: 1, data });

  if (error) {
    throw error;
  }
}

function linkAuthor(author: string, book: string): ActionInvocation {
  return {
    action: "linkAuthor",
    version: 1,
    target: author,
    input: { to: book },
  };
}

function everyOf(type: string): ViewQuery {
  return { type, filter: [], sort: [] };
}

function idOf(result: ActionResult): string {
  if (result.kind !== "done") {
    throw new Error(`the action was refused: ${JSON.stringify(result)}`);
  }

  return result.id;
}
