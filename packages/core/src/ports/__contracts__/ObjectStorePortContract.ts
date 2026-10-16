import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { type JsonValue, Ontology } from "@origamic/spec";

import type {
  ActionInvocation,
  ObjectStorePort,
  StoredObject,
  ViewQuery,
} from "../objectStorePort.ts";
import { collect } from "./emissions.ts";
import { createBookOntology, createId } from "./fixtures.ts";

/** What a store starts with: the owner's ontology, and objects already written, each at the type version it names. */
export interface ObjectStoreState {
  ontology: Ontology;
  objects: readonly StoredObject[];
}

/**
 * The behaviour every ObjectStorePort adapter owes its callers, on the book
 * tracker's ontology. Each adapter's test calls this with a function that
 * makes a fresh store, for one owner, holding `initial`; an adapter that
 * passes is interchangeable with the others.
 *
 * Every id the contract writes is a UUID, so a store that keys objects by one
 * can take them as they are.
 */
export function describeObjectStorePortContract(
  label: string,
  createStore: (initial: ObjectStoreState) => Promise<ObjectStorePort>,
): void {
  describe(`${label} :: ObjectStorePort contract`, () => {
    it("executing createBook with a valid input stores one object and returns its id", async () => {
      const store = await createStore(createState([]));

      const result = await store.execute(
        createBook({ title: "Dune", author: "Frank Herbert", rating: 5 }),
      );

      if (result.kind !== "done") {
        throw new Error(`createBook was refused: ${JSON.stringify(result)}`);
      }

      expect(await firstValueFrom(store.view(allBooks()))).toEqual([
        {
          id: result.id,
          type: "Book",
          typeVersion: 1,
          values: {
            title: "Dune",
            author: "Frank Herbert",
            status: "want",
            rating: 5,
          },
        },
      ]);
    });

    it("executing createBook without a title is rejected, and a view sees nothing", async () => {
      const store = await createStore(createState([]));

      const result = await store.execute(createBook({ author: "Anonymous" }));

      expect(result).toMatchObject({
        kind: "rejected",
        problems: [{ path: "title" }],
      });
      expect(await firstValueFrom(store.view(allBooks()))).toEqual([]);
    });

    it("a view emits again after an action through the same store", async () => {
      const store = await createStore(createState([]));
      const seen = collect(store.view(allBooks()));

      await seen.next();
      await store.execute(createBook({ title: "Dune" }));
      await seen.next();
      seen.stop();

      expect(
        seen.emissions.map((rows) => {
          return rows.length;
        }),
      ).toEqual([0, 1]);
    });

    it("a numeric filter and sort compare numbers", async () => {
      const store = await createStore(
        createState([
          createStoredBook("Four", 4),
          createStoredBook("Nine", 9),
          createStoredBook("Ten", 10),
        ]),
      );

      const aboveFive = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [{ property: "rating", op: "gt", value: 5 }],
          sort: [],
        }),
      );

      const belowTen = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [{ property: "rating", op: "lt", value: 10 }],
          sort: [{ property: "rating", dir: "asc" }],
        }),
      );

      const byRating = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [],
          sort: [{ property: "rating", dir: "desc" }],
        }),
      );

      expect(ratingsOf(aboveFive).sort(byNumber)).toEqual([9, 10]);
      expect(ratingsOf(belowTen)).toEqual([4, 9]);
      expect(ratingsOf(byRating)).toEqual([10, 9, 4]);
    });

    it("a limit keeps the first objects of the order", async () => {
      const store = await createStore(
        createState([
          createStoredBook("Four", 4),
          createStoredBook("Nine", 9),
          createStoredBook("Ten", 10),
        ]),
      );

      const topTwo = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [],
          sort: [{ property: "rating", dir: "desc" }],
          limit: 2,
        }),
      );

      expect(ratingsOf(topTwo)).toEqual([10, 9]);
    });

    it("eq and neq compare values, and contains ignores case", async () => {
      const store = await createStore(
        createState([
          createStoredBook("Dune", 4, "done"),
          createStoredBook("Children of Dune", 3, "reading"),
          createStoredBook("Emma", 5, "done"),
        ]),
      );

      const done = await firstValueFrom(
        store.view(
          titlesWhere({ property: "status", op: "eq", value: "done" }),
        ),
      );

      const notDone = await firstValueFrom(
        store.view(
          titlesWhere({ property: "status", op: "neq", value: "done" }),
        ),
      );

      const dunes = await firstValueFrom(
        store.view(
          titlesWhere({ property: "title", op: "contains", value: "dUNE" }),
        ),
      );

      expect(titlesOf(done)).toEqual(["Dune", "Emma"]);
      expect(titlesOf(notDone)).toEqual(["Children of Dune"]);
      expect(titlesOf(dunes)).toEqual(["Children of Dune", "Dune"]);
    });

    it("an update merges into the object and keeps what it does not set", async () => {
      const book = createStoredBook("Dune", 4, "reading");
      const other = createStoredBook("Emma", 5, "reading");
      const store = await createStore(createState([book, other]));

      const result = await store.execute(
        updateBook(book.id, { status: "done" }),
      );

      expect(result).toEqual({ kind: "done", id: book.id });
      expect(await firstValueFrom(store.view(allBooks()))).toEqual([
        { ...book, values: { ...book.values, status: "done" } },
        other,
      ]);
    });

    it("an update of an object of another type, or of none, is rejected", async () => {
      const author = createStoredAuthor("Frank Herbert");
      const book = createStoredBook("Dune", 4);
      const store = await createStore(createState([author, book]));

      const ofAnother = await store.execute(
        updateBook(author.id, { title: "Dune" }),
      );

      const ofNone = await store.execute(
        updateBook(createId(), { title: "Dune" }),
      );

      const withoutTarget = await store.execute({
        action: "updateBook",
        version: 1,
        input: { title: "Dune" },
      });

      for (const result of [ofAnother, ofNone, withoutTarget]) {
        expect(result).toMatchObject({
          kind: "rejected",
          problems: [{ path: "target" }],
        });
      }

      expect(await firstValueFrom(store.view(allBooks()))).toEqual([book]);
    });

    it("a link between two objects is stored, and a delete takes its links with it", async () => {
      const first = createStoredBook("Dune", 5);
      const second = createStoredBook("Dune Messiah", 4);
      const third = createStoredBook("Children of Dune", 3);
      const store = await createStore(createState([first, second, third]));

      const linked = await store.execute(linkSequel(first.id, second.id));
      // A sequel link is one-to-one, so the stored link refuses a second one.
      const again = await store.execute(linkSequel(first.id, third.id));
      const deleted = await store.execute({
        action: "deleteBook",
        version: 1,
        target: second.id,
        input: {},
      });
      // With the second book its link went, so the first is free to link again.
      const relinked = await store.execute(linkSequel(first.id, third.id));

      expect(linked).toEqual({ kind: "done", id: first.id });
      expect(again).toMatchObject({ kind: "rejected" });
      expect(deleted).toEqual({ kind: "done", id: second.id });
      expect(relinked).toEqual({ kind: "done", id: first.id });
      expect(titlesOf(await firstValueFrom(store.view(allBooks())))).toEqual([
        "Children of Dune",
        "Dune",
      ]);
    });

    it("each link type holds to its cardinality, and no pair is linked twice", async () => {
      const author = createStoredAuthor("Frank Herbert");
      const other = createStoredAuthor("Jane Austen");
      const [dune, messiah, emma] = [
        createStoredBook("Dune", 5),
        createStoredBook("Dune Messiah", 4),
        createStoredBook("Emma", 5),
      ];

      const store = await createStore(
        createState([author, other, dune, messiah, emma]),
      );

      // One-to-many: an author has many books, and a book has one author.
      const wrote = await store.execute(linkAuthor(author.id, dune.id));
      const wroteToo = await store.execute(linkAuthor(author.id, messiah.id));
      const secondAuthor = await store.execute(linkAuthor(other.id, dune.id));
      // Many-to-many: as many as there are pairs, each pair once.
      const similar = await store.execute(linkSimilar(dune.id, messiah.id));
      const alsoSimilar = await store.execute(linkSimilar(emma.id, messiah.id));
      const andSo = await store.execute(linkSimilar(dune.id, emma.id));
      const twice = await store.execute(linkSimilar(dune.id, messiah.id));

      expect([wrote, wroteToo, similar, alsoSimilar, andSo]).toEqual([
        { kind: "done", id: author.id },
        { kind: "done", id: author.id },
        { kind: "done", id: dune.id },
        { kind: "done", id: emma.id },
        { kind: "done", id: dune.id },
      ]);
      expect(secondAuthor).toMatchObject({ kind: "rejected" });
      expect(twice).toMatchObject({ kind: "rejected" });
    });

    it("a link to an object of another type than its far end is rejected", async () => {
      const author = createStoredAuthor("Frank Herbert");
      const book = createStoredBook("Dune", 5);
      const store = await createStore(createState([author, book]));

      const result = await store.execute(linkSequel(book.id, author.id));

      expect(result).toMatchObject({
        kind: "rejected",
        problems: [{ path: "to" }],
      });
    });

    it("an object without the property sorts last either way, and a filter reads it as null", async () => {
      const unrated: StoredObject = {
        id: createId(),
        type: "Book",
        typeVersion: 1,
        values: { title: "Unrated", status: "want" },
      };

      const store = await createStore(
        createState([
          createStoredBook("Four", 4),
          unrated,
          createStoredBook("Nine", 9),
        ]),
      );

      const ascending = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [],
          sort: [{ property: "rating", dir: "asc" }],
        }),
      );

      const descending = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [],
          sort: [{ property: "rating", dir: "desc" }],
        }),
      );

      const withoutRating = await firstValueFrom(
        store.view(titlesWhere({ property: "rating", op: "eq", value: null })),
      );

      const notFour = await firstValueFrom(
        store.view(titlesWhere({ property: "rating", op: "neq", value: 4 })),
      );

      expect(titlesOf(ascending)).toEqual(["Four", "Nine", "Unrated"]);
      expect(titlesOf(descending)).toEqual(["Nine", "Four", "Unrated"]);
      expect(titlesOf(withoutRating)).toEqual(["Unrated"]);
      expect(titlesOf(notFour)).toEqual(["Nine", "Unrated"]);
    });

    it("gt and lt compare text by its characters, and a value of another type matches neither", async () => {
      const store = await createStore(
        createState([
          createStoredBook("Dune", 4),
          createStoredBook("Emma", 9),
          createStoredBook("Ulysses", 10),
        ]),
      );

      const afterE = await firstValueFrom(
        store.view(titlesWhere({ property: "title", op: "gt", value: "E" })),
      );

      const beforeU = await firstValueFrom(
        store.view(titlesWhere({ property: "title", op: "lt", value: "U" })),
      );

      const textAgainstNumber = await firstValueFrom(
        store.view(titlesWhere({ property: "rating", op: "gt", value: "5" })),
      );

      const numberAgainstText = await firstValueFrom(
        store.view(titlesWhere({ property: "title", op: "lt", value: 5 })),
      );

      expect(titlesOf(afterE)).toEqual(["Emma", "Ulysses"]);
      expect(titlesOf(beforeU)).toEqual(["Dune", "Emma"]);
      expect(textAgainstNumber).toEqual([]);
      expect(numberAgainstText).toEqual([]);
    });

    it("text sorts and compares by its code units, so capitals come first", async () => {
      const store = await createStore(
        createState([
          createStoredBook("apple", 4),
          createStoredBook("Banana", 4),
        ]),
      );

      const sorted = await firstValueFrom(store.view(allBooks()));
      const beforeLower = await firstValueFrom(
        store.view(titlesWhere({ property: "title", op: "lt", value: "a" })),
      );

      expect(titlesOf(sorted)).toEqual(["Banana", "apple"]);
      expect(titlesOf(beforeLower)).toEqual(["Banana"]);
    });

    it("contains takes % and _ as the characters they are", async () => {
      const store = await createStore(
        createState([
          createStoredBook("100% Dune", 4),
          createStoredBook("1000 Dune", 4),
          createStoredBook("a_b", 4),
          createStoredBook("axb", 4),
        ]),
      );

      const percent = await firstValueFrom(
        store.view(
          titlesWhere({ property: "title", op: "contains", value: "0%" }),
        ),
      );

      const underscore = await firstValueFrom(
        store.view(
          titlesWhere({ property: "title", op: "contains", value: "a_b" }),
        ),
      );

      expect(titlesOf(percent)).toEqual(["100% Dune"]);
      expect(titlesOf(underscore)).toEqual(["a_b"]);
    });

    it("values of two JSON types sort by type, as Postgres orders jsonb", async () => {
      const ratings: JsonValue[] = [{ stars: 4 }, [4], true, 4, "four"];
      const store = await createStore(
        createState(
          ratings.map((rating, index) => {
            return {
              id: createId(),
              type: "Book",
              typeVersion: 1,
              values: { title: `Book ${index}`, status: "want", rating },
            };
          }),
        ),
      );

      const ascending = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [],
          sort: [{ property: "rating", dir: "asc" }],
        }),
      );

      const descending = await firstValueFrom(
        store.view({
          type: "Book",
          filter: [],
          sort: [{ property: "rating", dir: "desc" }],
        }),
      );

      expect(ratingsOf(ascending)).toEqual([
        "four",
        4,
        true,
        [4],
        { stars: 4 },
      ]);
      expect(ratingsOf(descending)).toEqual([
        { stars: 4 },
        [4],
        true,
        4,
        "four",
      ]);
    });

    it("a link to an object that is not there is rejected", async () => {
      const book = createStoredBook("Dune", 5);
      const store = await createStore(createState([book]));

      const result = await store.execute(linkSequel(book.id, createId()));

      expect(result).toMatchObject({
        kind: "rejected",
        problems: [{ path: "to" }],
      });
    });
  });
}

/** The book tracker's ontology, with an `Author` type, a link of each cardinality (`Sequel`, `Wrote`, `Similar`), and the actions to delete a book and to write each link. */
function createState(objects: readonly StoredObject[]): ObjectStoreState {
  const books = createBookOntology();

  return {
    ontology: Ontology.parse({
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
        { name: "Sequel", from: "Book", to: "Book", cardinality: "one-to-one" },
        {
          name: "Wrote",
          from: "Author",
          to: "Book",
          cardinality: "one-to-many",
        },
        {
          name: "Similar",
          from: "Book",
          to: "Book",
          cardinality: "many-to-many",
        },
      ],
      actionTypes: [
        ...books.actionTypes,
        { name: "deleteBook", version: 1, kind: "delete", type: "Book" },
        { name: "linkSequel", version: 1, kind: "link", linkType: "Sequel" },
        { name: "linkAuthor", version: 1, kind: "link", linkType: "Wrote" },
        { name: "linkSimilar", version: 1, kind: "link", linkType: "Similar" },
      ],
    }),
    objects,
  };
}

function createStoredBook(
  title: string,
  rating: number,
  status = "want",
): StoredObject {
  return {
    id: createId(),
    type: "Book",
    typeVersion: 1,
    values: { title, status, rating },
  };
}

function createStoredAuthor(name: string): StoredObject {
  return {
    id: createId(),
    type: "Author",
    typeVersion: 1,
    values: { name },
  };
}

function createBook(input: Record<string, JsonValue>): ActionInvocation {
  return { action: "createBook", version: 1, input };
}

function updateBook(
  target: string,
  input: Record<string, JsonValue>,
): ActionInvocation {
  return { action: "updateBook", version: 1, target, input };
}

function linkSequel(from: string, to: string): ActionInvocation {
  return { action: "linkSequel", version: 1, target: from, input: { to } };
}

function linkAuthor(from: string, to: string): ActionInvocation {
  return { action: "linkAuthor", version: 1, target: from, input: { to } };
}

function linkSimilar(from: string, to: string): ActionInvocation {
  return { action: "linkSimilar", version: 1, target: from, input: { to } };
}

function allBooks(): ViewQuery {
  return {
    type: "Book",
    filter: [],
    sort: [{ property: "title", dir: "asc" }],
  };
}

function titlesWhere(filter: ViewQuery["filter"][number]): ViewQuery {
  return {
    type: "Book",
    filter: [filter],
    sort: [{ property: "title", dir: "asc" }],
  };
}

function ratingsOf(objects: readonly StoredObject[]): JsonValue[] {
  return objects.map((object) => {
    return object.values.rating ?? null;
  });
}

function titlesOf(objects: readonly StoredObject[]): JsonValue[] {
  return objects.map((object) => {
    return object.values.title ?? null;
  });
}

function byNumber(left: JsonValue, right: JsonValue): number {
  return Number(left) - Number(right);
}
