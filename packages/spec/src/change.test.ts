import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { AppDraft } from "./binding.ts";
import { type Applied, applyChangeSet } from "./change.ts";
import { ChangeSet, Ontology } from "./ontology.ts";
import { checkApp } from "./references.ts";
import {
  createBookOntology,
  createCatalog,
  createDateFinishedApp,
  createDateFinishedChange,
} from "./testing/bookTracker.ts";

describe("applying a change set", () => {
  it("the date-finished change takes the book tracker from 1 to 2", () => {
    const ontology = ontologyAfter(createDateFinishedChange());

    expect(ontology.version).toBe(2);
    expect(versionsOf(ontology)).toEqual({
      Book: 2,
      createBook: 1,
      updateBook: 2,
    });
  });

  it("the revision of step 7 checks against the ontology the change yields", () => {
    const ontology = ontologyAfter(createDateFinishedChange());
    const revision = AppDraft.parse(createDateFinishedApp());

    expect(checkApp(revision, ontology, createCatalog().manifest)).toEqual([]);
  });

  it("a type touched twice in one change set moves one version", () => {
    const ontology = ontologyAfter({
      format: 1,
      baseVersion: 1,
      operations: [
        {
          op: "addProperty",
          type: "Book",
          property: { name: "pages", type: "integer" },
        },
        {
          op: "addProperty",
          type: "Book",
          property: { name: "isbn", type: "string" },
        },
      ],
    });

    expect(versionsOf(ontology)).toEqual({
      Book: 2,
      createBook: 1,
      updateBook: 1,
    });
  });

  it("a change written against an older version is stale", () => {
    const change = { ...createDateFinishedChange(), baseVersion: 0 };

    expect(apply(change)).toEqual({ kind: "stale", current: 1 });
  });

  it("adding a type that exists is invalid", () => {
    expect(
      applyOne({
        op: "addObjectType",
        objectType: {
          name: "Book",
          titleProperty: "title",
          properties: [{ name: "title", type: "string" }],
        },
      }),
    ).toEqual(invalidAt('the ontology already has a type named "Book"'));
  });

  it("adding a property that exists is invalid", () => {
    expect(
      applyOne({
        op: "addProperty",
        type: "Book",
        property: { name: "rating", type: "number" },
      }),
    ).toEqual(invalidAt('"Book" already has a property named "rating"'));
  });

  it("replacing an action that does not exist is invalid", () => {
    expect(
      applyOne({
        op: "replaceActionType",
        actionType: { name: "deleteBook", kind: "delete", type: "Book" },
      }),
    ).toEqual(invalidAt('the ontology has no action named "deleteBook"'));
  });

  it("deprecating the title property is invalid", () => {
    expect(
      applyOne({ op: "deprecateProperty", type: "Book", property: "title" }),
    ).toEqual(
      invalidAt('"title" is the title property of "Book", which stays in use'),
    );
  });

  it("deprecating a property keeps it, marked, once no action sets it", () => {
    const ontology = ontologyAfter({
      format: 1,
      baseVersion: 1,
      operations: [
        { op: "deprecateProperty", type: "Book", property: "rating" },
        {
          op: "replaceActionType",
          actionType: {
            name: "createBook",
            kind: "create",
            type: "Book",
            fields: ["title", "author", "status"],
          },
        },
        {
          op: "replaceActionType",
          actionType: {
            name: "updateBook",
            kind: "update",
            type: "Book",
            fields: ["title", "author", "status"],
          },
        },
      ],
    });

    expect(ontology.objectTypes[0]?.properties[3]).toMatchObject({
      name: "rating",
      deprecated: true,
    });
    expect(versionsOf(ontology)).toEqual({
      Book: 2,
      createBook: 2,
      updateBook: 2,
    });
  });

  it("a change that names a type or a property the ontology does not have is invalid", () => {
    expect(
      apply({
        format: 1,
        baseVersion: 1,
        operations: [
          {
            op: "addProperty",
            type: "Author",
            property: { name: "born", type: "date" },
          },
          { op: "deprecateProperty", type: "Author", property: "born" },
          { op: "deprecateProperty", type: "Book", property: "pages" },
        ],
      }),
    ).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "operations.0",
          message: 'the ontology has no type named "Author"',
        },
        {
          path: "operations.1",
          message: 'the ontology has no type named "Author"',
        },
        {
          path: "operations.2",
          message: '"Book" has no property named "pages"',
        },
      ],
    });
  });

  it("a link type is added once, and moves the ontology but no type", () => {
    const sequel: OperationInput = {
      op: "addLinkType",
      linkType: {
        name: "Sequel",
        from: "Book",
        to: "Book",
        cardinality: "one-to-one",
      },
    };

    const ontology = ontologyAfter({
      format: 1,
      baseVersion: 1,
      operations: [sequel],
    });

    expect(ontology.version).toBe(2);
    expect(ontology.linkTypes.map(nameOf)).toEqual(["Sequel"]);
    expect(versionsOf(ontology)).toEqual({
      Book: 1,
      createBook: 1,
      updateBook: 1,
    });
    expect(
      apply({ format: 1, baseVersion: 1, operations: [sequel, sequel] }),
    ).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "operations.1",
          message: 'the ontology already has a link type named "Sequel"',
        },
      ],
    });
  });

  it("the result passes the Ontology schema", () => {
    expect(
      applyOne({
        op: "addActionType",
        actionType: {
          name: "rateBook",
          kind: "update",
          type: "Book",
          fields: ["stars"],
        },
      }),
    ).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "actionTypes.2.fields.0",
          message:
            'the action "rateBook" sets "stars", which "Book" does not have in use',
        },
      ],
    });
  });

  it("an empty ontology takes a first change set", () => {
    const empty: OntologyInput = { format: 1, version: 0, objectTypes: [] };
    const ontology = ontologyAfter(
      {
        format: 1,
        baseVersion: 0,
        operations: [
          {
            op: "addObjectType",
            objectType: {
              name: "Book",
              titleProperty: "title",
              properties: [{ name: "title", type: "string", required: true }],
            },
          },
        ],
      },
      empty,
    );

    expect(ontology.version).toBe(1);
    expect(versionsOf(ontology)).toEqual({ Book: 1 });
  });

  it("leaves the ontology it was given as it was", () => {
    const ontology = Ontology.parse(createBookOntology());

    applyChangeSet(ontology, ChangeSet.parse(createDateFinishedChange()));

    expect(ontology).toEqual(Ontology.parse(createBookOntology()));
  });
});

type ChangeSetInput = z.input<typeof ChangeSet>;
type OntologyInput = z.input<typeof Ontology>;
type OperationInput = ChangeSetInput["operations"][number];

interface Named {
  name: string;
}

function apply(
  change: ChangeSetInput,
  ontology: OntologyInput = createBookOntology(),
): Applied {
  return applyChangeSet(Ontology.parse(ontology), ChangeSet.parse(change));
}

/** One operation, written against the book tracker's version 1. */
function applyOne(operation: OperationInput): Applied {
  return apply({ format: 1, baseVersion: 1, operations: [operation] });
}

function ontologyAfter(
  change: ChangeSetInput,
  ontology: OntologyInput = createBookOntology(),
): Ontology {
  const applied = apply(change, ontology);

  if (applied.kind !== "applied") {
    throw new Error(`the change set was not applied: ${applied.kind}`);
  }

  return applied.ontology;
}

/** Each type's and each action's version, by name. */
function versionsOf(ontology: Ontology): Record<string, number> {
  return Object.fromEntries(
    [...ontology.objectTypes, ...ontology.actionTypes].map((item) => {
      return [item.name, item.version];
    }),
  );
}

function nameOf(item: Named): string {
  return item.name;
}

function invalidAt(message: string): Applied {
  return { kind: "invalid", problems: [{ path: "operations.0", message }] };
}
