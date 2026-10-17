import { describe, expect, it } from "vitest";

import { ChangeSet, Ontology } from "@origamic/spec";
import {
  createBookChange,
  createBookOntology,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

import { describeChangeSet } from "./describeChangeSet.ts";

describe("describeChangeSet", () => {
  it("says what the book tracker's first change set adds", () => {
    expect(
      describeChangeSet(ChangeSet.parse(createBookChange()), createEmpty()),
    ).toEqual([
      "Book: add type with title, author, status, rating",
      "createBook: add action that creates a Book, setting title, author, status, rating",
      "updateBook: add action that updates a Book, setting title, author, status, rating",
    ]);
  });

  it("says what the date-finished change adds and changes", () => {
    expect(
      describeChangeSet(
        ChangeSet.parse(createDateFinishedChange()),
        Ontology.parse(createBookOntology()),
      ),
    ).toEqual([
      "Book: add dateFinished (date, optional)",
      "updateBook: now also sets dateFinished",
    ]);
  });

  it("says what a required property, a default, a deprecation and a link are", () => {
    expect(
      describeChangeSet(
        ChangeSet.parse({
          format: 1,
          baseVersion: 1,
          operations: [
            {
              op: "addProperty",
              type: "Book",
              property: {
                name: "format",
                type: "enum",
                values: ["paper", "ebook"],
                required: true,
                default: "paper",
              },
            },
            { op: "deprecateProperty", type: "Book", property: "rating" },
            {
              op: "addLinkType",
              linkType: {
                name: "Sequel",
                from: "Book",
                to: "Book",
                cardinality: "one-to-one",
              },
            },
            {
              op: "addActionType",
              actionType: {
                name: "linkSequel",
                kind: "link",
                linkType: "Sequel",
              },
            },
            {
              op: "addActionType",
              actionType: { name: "deleteBook", kind: "delete", type: "Book" },
            },
          ],
        }),
        Ontology.parse(createBookOntology()),
      ),
    ).toEqual([
      'Book: add format (enum of paper, ebook, required, default "paper")',
      "Book: deprecate rating",
      "Sequel: add link from Book to Book, one-to-one",
      "linkSequel: add action that links by Sequel",
      "deleteBook: add action that deletes a Book",
    ]);
  });

  it("says what a replaced action stops setting, and what else it changes", () => {
    expect(
      describeChangeSet(
        ChangeSet.parse({
          format: 1,
          baseVersion: 1,
          operations: [
            {
              op: "replaceActionType",
              actionType: {
                name: "updateBook",
                kind: "update",
                type: "Book",
                fields: ["title", "status"],
                rules: [
                  { kind: "required", property: "title" },
                  { kind: "range", property: "status", min: 1 },
                  { kind: "range", property: "author", max: 9 },
                  { kind: "range", property: "rating" },
                ],
              },
            },
            {
              op: "replaceActionType",
              actionType: {
                name: "createBook",
                kind: "update",
                type: "Book",
                fields: ["title", "author", "status", "rating"],
              },
            },
            {
              op: "replaceActionType",
              actionType: { name: "deleteBook", kind: "delete", type: "Book" },
            },
            {
              op: "replaceActionType",
              actionType: { name: "shelveBook", kind: "delete", type: "Book" },
            },
          ],
        }),
        createOntologyWithDelete(),
      ),
    ).toEqual([
      "updateBook: no longer sets author, rating; now requires title to be set, status of at least 1, author of at most 9, rating to be a number; no longer requires rating from 1 to 5",
      "createBook: now updates a Book, setting title, author, status, rating; no longer requires rating from 1 to 5",
      "deleteBook: replaced, as it was",
      "shelveBook: replace an action the ontology does not have",
    ]);
  });
});

/** The book tracker's ontology, with an action that deletes a book. */
function createOntologyWithDelete(): Ontology {
  const ontology = createBookOntology();

  return Ontology.parse({
    ...ontology,
    actionTypes: [
      ...(ontology.actionTypes ?? []),
      { name: "deleteBook", version: 1, kind: "delete", type: "Book" },
    ],
  });
}

function createEmpty(): Ontology {
  return Ontology.parse({ format: 1, version: 0, objectTypes: [] });
}
