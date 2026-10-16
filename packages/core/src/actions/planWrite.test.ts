import { describe, expect, it } from "vitest";

import {
  applyChangeSet,
  ChangeSet,
  type JsonValue,
  Ontology,
} from "@origamic/spec";
import {
  createBookOntology,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

import type {
  ActionInvocation,
  StoredObject,
} from "#/ports/objectStorePort.ts";

import { planWrite } from "./planWrite.ts";

describe("planWrite", () => {
  describe("the values an action writes", () => {
    it("a property required on the type is refused when the input lacks it", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ author: "Anonymous" }),
        null,
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [{ path: "title", message: '"title" is required' }],
      });
    });

    it("a required text property is refused when it is empty or null", () => {
      const empty = planWrite(
        createOntology(),
        createBook({ title: "" }),
        null,
      );

      const cleared = planWrite(
        createOntology(),
        updateBook("dune", { title: null }),
        createStoredBook(),
      );

      expect(empty).toMatchObject({
        kind: "rejected",
        problems: [{ path: "title" }],
      });
      expect(cleared).toMatchObject({
        kind: "rejected",
        problems: [{ path: "title" }],
      });
    });

    it("a property required by a rule of the action is refused when the input lacks it", () => {
      const ontology = withCreateRules([
        { kind: "required", property: "author" },
      ]);

      const without = planWrite(ontology, createBook({ title: "Dune" }), null);
      const withIt = planWrite(
        ontology,
        createBook({ title: "Dune", author: "Frank Herbert" }),
        null,
      );

      expect(without).toEqual({
        kind: "rejected",
        problems: [{ path: "author", message: '"author" is required' }],
      });
      expect(withIt.kind).toBe("write");
    });

    it("a range rule holds rating from 1 to 5", () => {
      const planned = [0, 1, 5, 6].map((rating) => {
        return planWrite(
          createOntology(),
          createBook({ title: "Dune", rating }),
          null,
        );
      });

      expect(planned).toEqual([
        {
          kind: "rejected",
          problems: [{ path: "rating", message: '"rating" is at least 1' }],
        },
        expect.objectContaining({ kind: "write" }),
        expect.objectContaining({ kind: "write" }),
        {
          kind: "rejected",
          problems: [{ path: "rating", message: '"rating" is at most 5' }],
        },
      ]);
    });

    it("an integer property refuses 4.5", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ title: "Dune", rating: 4.5 }),
        null,
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [{ path: "rating", message: '"rating" is a whole number' }],
      });
    });

    it("an enum property refuses a value it does not list", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ title: "Dune", status: "maybe" }),
        null,
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [
          {
            path: "status",
            message: '"status" is one of want, reading, done',
          },
        ],
      });
    });

    it("a field the action does not set is refused", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ title: "Dune", pages: 412 }),
        null,
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [
          { path: "pages", message: '"createBook" does not set "pages"' },
        ],
      });
    });

    it("an inherited name is not taken for a field the action sets", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ title: "Dune", constructor: "x", toString: "y" }),
        null,
      );

      expect(planned).toMatchObject({
        kind: "rejected",
        problems: [{ path: "constructor" }, { path: "toString" }],
      });
    });

    it("every problem of an invocation is reported at once", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ status: "maybe", rating: 9 }),
        null,
      );

      expect(planned).toMatchObject({
        kind: "rejected",
        problems: [{ path: "status" }, { path: "rating" }, { path: "title" }],
      });
    });
  });

  describe("a create", () => {
    it("a create fills a property's default", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ title: "Dune" }),
        null,
      );

      expect(planned).toEqual({
        kind: "write",
        write: {
          kind: "create",
          type: "Book",
          typeVersion: 1,
          values: { title: "Dune", status: "want" },
        },
      });
    });

    it("a create keeps a value it is given over the default, and leaves out a null", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ title: "Dune", status: "reading", author: null }),
        null,
      );

      expect(planned).toMatchObject({
        write: { values: { title: "Dune", status: "reading" } },
      });
    });

    it("a create writes the type's current version", () => {
      const planned = planWrite(
        createRevisedOntology(),
        createBook({ title: "Dune" }),
        null,
      );

      expect(planned).toMatchObject({ write: { typeVersion: 2 } });
    });
  });

  describe("an update", () => {
    it("an update of a book written at Book@1 keeps its values and writes typeVersion: 2", () => {
      const book = createStoredBook();

      const planned = planWrite(
        createRevisedOntology(),
        { ...updateBook(book.id, { dateFinished: "2026-10-16" }), version: 2 },
        book,
      );

      expect(planned).toEqual({
        kind: "write",
        write: {
          kind: "update",
          id: "dune",
          typeVersion: 2,
          values: { ...book.values, dateFinished: "2026-10-16" },
        },
      });
    });

    it("an update clears an optional property it sets to null", () => {
      const planned = planWrite(
        createOntology(),
        updateBook("dune", { rating: null }),
        createStoredBook(),
      );

      expect(planned).toMatchObject({
        write: {
          values: { title: "Dune", author: "Frank Herbert", status: "reading" },
        },
      });
      expect(
        planned.kind === "write" && planned.write.kind === "update"
          ? Object.hasOwn(planned.write.values, "rating")
          : true,
      ).toBe(false);
    });

    it("an update fills the default of a property its object was written without", () => {
      const book = createStoredBook({ title: "Dune" });

      const planned = planWrite(
        createOntology(),
        updateBook(book.id, { rating: 5 }),
        book,
      );

      expect(planned).toMatchObject({
        write: { values: { title: "Dune", status: "want", rating: 5 } },
      });
    });

    it("an update of no object, or of an object of another type, is refused", () => {
      const author: StoredObject = {
        id: "herbert",
        type: "Author",
        typeVersion: 1,
        values: { name: "Frank Herbert" },
      };

      const none = planWrite(
        createOntology(),
        updateBook("gone", { title: "Dune" }),
        null,
      );

      const untargeted = planWrite(
        createOntology(),
        { action: "updateBook", version: 1, input: { title: "Dune" } },
        null,
      );

      const another = planWrite(
        createOntology(),
        updateBook("herbert", { title: "Dune" }),
        author,
      );

      expect([none, untargeted, another]).toEqual([
        {
          kind: "rejected",
          problems: [
            {
              path: "target",
              message: '"updateBook" acts on "gone", which is not there',
            },
          ],
        },
        {
          kind: "rejected",
          problems: [
            {
              path: "target",
              message: '"updateBook" acts on an object, and names none',
            },
          ],
        },
        {
          kind: "rejected",
          problems: [
            {
              path: "target",
              message:
                '"updateBook" acts on a "Book", and "herbert" is a "Author"',
            },
          ],
        },
      ]);
    });
  });

  describe("defaults", () => {
    it("an update that sets a required property to null is refused, not reset to its default", () => {
      const planned = planWrite(
        createOntology(),
        updateBook("dune", { status: null }),
        createStoredBook({ title: "Dune", status: "done" }),
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [{ path: "status", message: '"status" is required' }],
      });
    });

    it("an optional property with a default can be cleared", () => {
      const planned = planWrite(
        createShelvedOntology(false),
        updateBook("dune", { shelf: null }),
        createStoredBook({ title: "Dune", status: "done", shelf: "attic" }),
      );

      expect(planned).toEqual({
        kind: "write",
        write: {
          kind: "update",
          id: "dune",
          typeVersion: 1,
          values: { title: "Dune", status: "done" },
        },
      });
    });

    it("a create that sets a required property to null is refused, not given its default", () => {
      const planned = planWrite(
        createOntology(),
        createBook({ title: "Dune", status: null }),
        null,
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [{ path: "status", message: '"status" is required' }],
      });
    });

    it("a create that sets an optional property with a default to null leaves it out", () => {
      const planned = planWrite(
        createShelvedOntology(false, "createBook"),
        createBook({ title: "Dune", shelf: null }),
        null,
      );

      expect(planned).toEqual({
        kind: "write",
        write: {
          kind: "create",
          type: "Book",
          typeVersion: 1,
          values: { title: "Dune", status: "want" },
        },
      });
    });

    it("a deprecated property's default is not filled", () => {
      const planned = planWrite(
        createShelvedOntology(true),
        createBook({ title: "Dune" }),
        null,
      );

      expect(planned).toMatchObject({
        write: { values: { title: "Dune", status: "want" } },
      });
      expect(
        planned.kind === "write" && planned.write.kind === "create"
          ? Object.hasOwn(planned.write.values, "shelf")
          : true,
      ).toBe(false);
    });
  });

  describe("the version an app binds", () => {
    it("an invocation of updateBook@1 against updateBook@2 runs if every field it sets is still set", () => {
      const planned = planWrite(
        createRevisedOntology(),
        updateBook("dune", { status: "done", rating: 5 }),
        createStoredBook(),
      );

      expect(planned).toMatchObject({
        kind: "write",
        write: { kind: "update", typeVersion: 2 },
      });
    });

    it("an invocation of updateBook@1 against updateBook@2 is refused if a field it sets is no longer set", () => {
      const planned = planWrite(
        createOntologyWithoutRating(),
        updateBook("dune", { status: "done", rating: 5 }),
        createStoredBook(),
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [
          {
            path: "rating",
            message:
              '"updateBook" no longer sets "rating": the app binds version 1, and it is at 2',
          },
        ],
      });
    });

    it("an invocation below version 1 is refused", () => {
      const planned = planWrite(
        createOntology(),
        { ...createBook({ title: "Dune" }), version: 0 },
        null,
      );

      expect(planned).toEqual({
        kind: "rejected",
        problems: [
          {
            path: "version",
            message:
              'an action\'s version is 1 or more; "createBook" was invoked at 0',
          },
        ],
      });
    });

    it("an action the ontology does not have, or not yet at that version, is refused", () => {
      const unknown = planWrite(
        createOntology(),
        { action: "deleteBook", version: 1, target: "dune", input: {} },
        createStoredBook(),
      );

      const inherited = planWrite(
        createOntology(),
        { action: "constructor", version: 1, input: {} },
        null,
      );

      const ahead = planWrite(
        createOntology(),
        { ...updateBook("dune", { status: "done" }), version: 2 },
        createStoredBook(),
      );

      expect([unknown, inherited, ahead]).toEqual([
        {
          kind: "rejected",
          problems: [
            {
              path: "action",
              message: 'the ontology has no action "deleteBook"',
            },
          ],
        },
        {
          kind: "rejected",
          problems: [
            {
              path: "action",
              message: 'the ontology has no action "constructor"',
            },
          ],
        },
        {
          kind: "rejected",
          problems: [
            {
              path: "version",
              message:
                '"updateBook@2" is not an action the ontology has; "updateBook" is at 1',
            },
          ],
        },
      ]);
    });
  });

  describe("a delete and a link", () => {
    it("a delete of an object of its type is planned, and it takes no input", () => {
      const ontology = createLinkingOntology();

      const planned = planWrite(
        ontology,
        { action: "deleteBook", version: 1, target: "dune", input: {} },
        createStoredBook(),
      );

      const withInput = planWrite(
        ontology,
        {
          action: "deleteBook",
          version: 1,
          target: "dune",
          input: { title: "x" },
        },
        createStoredBook(),
      );

      expect(planned).toEqual({
        kind: "write",
        write: { kind: "delete", id: "dune" },
      });
      expect(withInput).toEqual({
        kind: "rejected",
        problems: [
          { path: "title", message: '"deleteBook" does not set "title"' },
        ],
      });
    });

    it("a link goes from its target to the object its input names", () => {
      const planned = planWrite(
        createLinkingOntology(),
        {
          action: "linkSequel",
          version: 1,
          target: "dune",
          input: { to: "messiah" },
        },
        createStoredBook(),
      );

      expect(planned).toEqual({
        kind: "write",
        write: {
          kind: "link",
          linkType: "Sequel",
          from: "dune",
          to: "messiah",
        },
      });
    });

    it("a link needs the id of the object it links to, and nothing else", () => {
      const without = planWrite(
        createLinkingOntology(),
        { action: "linkSequel", version: 1, target: "dune", input: {} },
        createStoredBook(),
      );

      const notAnId = planWrite(
        createLinkingOntology(),
        {
          action: "linkSequel",
          version: 1,
          target: "dune",
          input: { to: 7, note: "x" },
        },
        createStoredBook(),
      );

      expect(without).toEqual({
        kind: "rejected",
        problems: [
          {
            path: "to",
            message: '"linkSequel" needs the id of the object it links to',
          },
        ],
      });
      expect(notAnId).toMatchObject({
        kind: "rejected",
        problems: [{ path: "note" }, { path: "to" }],
      });
    });

    it("a link from an object of another type is refused", () => {
      const author: StoredObject = {
        id: "herbert",
        type: "Author",
        typeVersion: 1,
        values: { name: "Frank Herbert" },
      };

      const planned = planWrite(
        createLinkingOntology(),
        {
          action: "linkSequel",
          version: 1,
          target: "herbert",
          input: { to: "dune" },
        },
        author,
      );

      expect(planned).toMatchObject({
        kind: "rejected",
        problems: [{ path: "target" }],
      });
    });
  });
});

function createOntology(): Ontology {
  return Ontology.parse(createBookOntology());
}

/** The ontology after slice step 7: `Book@2` with `dateFinished`, and `updateBook@2`, which sets it. */
function createRevisedOntology(): Ontology {
  return applied(createOntology(), ChangeSet.parse(createDateFinishedChange()));
}

/** `rating` deprecated, so `createBook@2` and `updateBook@2` no longer set it. */
function createOntologyWithoutRating(): Ontology {
  return applied(
    createOntology(),
    ChangeSet.parse({
      format: 1,
      baseVersion: 1,
      operations: [
        { op: "deprecateProperty", type: "Book", property: "rating" },
        ...["createBook", "updateBook"].map((name) => {
          return {
            op: "replaceActionType",
            actionType: {
              name,
              kind: name === "createBook" ? "create" : "update",
              type: "Book",
              fields: ["title", "author", "status"],
            },
          };
        }),
      ],
    }),
  );
}

/** `Book` with a `shelf` that defaults to "main", which `setBy` sets, or which is deprecated and set by nothing. */
function createShelvedOntology(
  deprecated: boolean,
  setBy = "updateBook",
): Ontology {
  const books = createBookOntology();
  const [book] = books.objectTypes;

  if (book === undefined) {
    throw new Error("the fixture ontology has no type");
  }

  return Ontology.parse({
    ...books,
    objectTypes: [
      {
        ...book,
        properties: [
          ...book.properties,
          { name: "shelf", type: "string", default: "main", deprecated },
        ],
      },
    ],
    actionTypes: (books.actionTypes ?? []).map((action) => {
      return deprecated || action.name !== setBy || !("fields" in action)
        ? action
        : { ...action, fields: [...action.fields, "shelf"] };
    }),
  });
}

/** The book tracker with `deleteBook`, and a `Sequel` link between books that `linkSequel` writes. */
function createLinkingOntology(): Ontology {
  const books = createBookOntology();

  return Ontology.parse({
    ...books,
    linkTypes: [
      { name: "Sequel", from: "Book", to: "Book", cardinality: "one-to-one" },
    ],
    actionTypes: [
      ...(books.actionTypes ?? []),
      { name: "deleteBook", version: 1, kind: "delete", type: "Book" },
      { name: "linkSequel", version: 1, kind: "link", linkType: "Sequel" },
    ],
  });
}

function withCreateRules(rules: unknown[]): Ontology {
  const books = createBookOntology();

  return Ontology.parse({
    ...books,
    actionTypes: (books.actionTypes ?? []).map((action) => {
      return action.name === "createBook" ? { ...action, rules } : action;
    }),
  });
}

function applied(ontology: Ontology, change: ChangeSet): Ontology {
  const result = applyChangeSet(ontology, change);

  if (result.kind !== "applied") {
    throw new Error(
      `the fixture change did not apply: ${JSON.stringify(result)}`,
    );
  }

  return result.ontology;
}

function createStoredBook(
  values: Record<string, JsonValue> = {
    title: "Dune",
    author: "Frank Herbert",
    status: "reading",
    rating: 4,
  },
): StoredObject {
  return { id: "dune", type: "Book", typeVersion: 1, values };
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
