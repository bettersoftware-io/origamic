import { describe, expect, it } from "vitest";

import { ChangeSet, Ontology } from "./ontology.ts";
import {
  createBookOntology,
  createDateFinishedChange,
} from "./testing/bookTracker.ts";
import { issuesOf } from "./testing/issues.ts";

describe("an ontology", () => {
  it("accepts the book tracker, and fills in what it left out", () => {
    const ontology = Ontology.parse(createBookOntology());

    expect(ontology.linkTypes).toEqual([]);
    expect(ontology.objectTypes[0]?.properties[1]).toEqual({
      name: "author",
      type: "string",
      required: false,
      deprecated: false,
    });
  });

  it("is rejected without its format or its version, or with a key it does not know", () => {
    const { format: _format, ...unformatted } = createBookOntology();
    const { version: _version, ...unversioned } = createBookOntology();

    expect(issuesOf(Ontology, unformatted)).not.toEqual([]);
    expect(issuesOf(Ontology, unversioned)).not.toEqual([]);
    expect(
      issuesOf(Ontology, { ...createBookOntology(), tables: [] }),
    ).not.toEqual([]);
  });

  it("is rejected with a key it does not know on a property or an action", () => {
    const onProperty = withProperty({
      name: "isbn",
      type: "string",
      unique: true,
    });
    const onAction = createBookOntology();

    onAction.actionTypes = [
      {
        name: "lose",
        version: 1,
        kind: "delete",
        type: "Book",
        soft: true,
      } as never,
    ];

    expect(issuesOf(Ontology, onProperty)).not.toEqual([]);
    expect(issuesOf(Ontology, onAction)).not.toEqual([]);
  });

  it("holds an enum to values listed once, and its default to one of them", () => {
    const shelf = {
      name: "shelf",
      type: "enum",
      values: ["home", "home"],
      default: "lent",
    };

    expect(issuesOf(Ontology, withProperty(shelf))).toEqual([
      '"home" is listed twice among the values of "shelf"',
      'the default "lent" of "shelf" is not one of its values',
    ]);
    expect(
      issuesOf(
        Ontology,
        withProperty({ name: "shelf", type: "enum", values: [] }),
      ),
    ).not.toEqual([]);
  });

  it("holds a default to its property's type", () => {
    expect(
      issuesOf(
        Ontology,
        withProperty({ name: "pages", type: "integer", default: 2.5 }),
      ),
    ).not.toEqual([]);
    expect(
      issuesOf(
        Ontology,
        withProperty({ name: "finished", type: "date", default: "last week" }),
      ),
    ).not.toEqual([]);
    expect(
      issuesOf(
        Ontology,
        withProperty({ name: "finished", type: "date", default: "2026-10-14" }),
      ),
    ).toEqual([]);
  });

  it("names an instance by a property it has in use", () => {
    const missing = createBookOntology();
    const deprecated = createBookOntology();

    missing.objectTypes[0] = { ...book(missing), titleProperty: "name" };
    deprecated.objectTypes[0] = {
      ...book(deprecated),
      properties: [{ name: "title", type: "string", deprecated: true }],
    };

    expect(issuesOf(Ontology, missing)).toContain(
      'the title property "name" of "Book" is not one of its properties in use',
    );
    expect(issuesOf(Ontology, deprecated)).toContain(
      'the title property "title" of "Book" is not one of its properties in use',
    );
  });

  it("names each type, property, link and action once", () => {
    const ontology = createBookOntology();
    const first = book(ontology);
    const actions = ontology.actionTypes ?? [];

    ontology.objectTypes.push(first);
    ontology.objectTypes[0] = {
      ...first,
      properties: [...first.properties, { name: "title", type: "text" }],
    };
    ontology.linkTypes = [
      { name: "Sequel", from: "Book", to: "Book", cardinality: "one-to-one" },
      { name: "Sequel", from: "Book", to: "Book", cardinality: "one-to-many" },
    ];
    ontology.actionTypes = [...actions, ...actions];

    expect(issuesOf(Ontology, ontology)).toEqual([
      'two of the ontology\'s object types are named "Book"',
      'two of the ontology\'s link types are named "Sequel"',
      'two of the ontology\'s actions are named "createBook"',
      '"Book" has two properties named "title"',
    ]);
  });

  it("links only the types it has, and its actions write only what it has in use", () => {
    const ontology = createBookOntology();

    ontology.linkTypes = [
      {
        name: "WrittenBy",
        from: "Book",
        to: "Author",
        cardinality: "many-to-many",
      },
    ];
    ontology.objectTypes[0] = {
      ...book(ontology),
      properties: [
        ...book(ontology).properties,
        { name: "isbn", type: "string", deprecated: true },
      ],
    };
    ontology.actionTypes = [
      {
        name: "addAuthor",
        version: 1,
        kind: "create",
        type: "Author",
        fields: ["name"],
      },
      {
        name: "setIsbn",
        version: 1,
        kind: "update",
        type: "Book",
        fields: ["isbn", "pages"],
      },
      { name: "credit", version: 1, kind: "link", linkType: "EditedBy" },
      { name: "lose", version: 1, kind: "delete", type: "Book" },
    ];

    expect(issuesOf(Ontology, ontology)).toEqual([
      'the link "WrittenBy" ends at "Author", which is not an object type',
      'the action "addAuthor" writes "Author", which is not an object type',
      'the action "setIsbn" sets "isbn", which "Book" does not have in use',
      'the action "setIsbn" sets "pages", which "Book" does not have in use',
      'the action "credit" links by "EditedBy", which is not a link type',
    ]);
  });

  it("lets a rule speak only of what its action sets", () => {
    const ontology = createBookOntology();

    ontology.actionTypes = [
      {
        name: "rate",
        version: 1,
        kind: "update",
        type: "Book",
        fields: ["rating"],
        rules: [{ kind: "required", property: "author" }],
      },
      {
        name: "lose",
        version: 1,
        kind: "delete",
        type: "Book",
        rules: [{ kind: "range", property: "rating", max: 5 }],
      },
    ];

    expect(issuesOf(Ontology, ontology)).toEqual([
      'a rule of "rate" is about "author", which the action does not set',
      'a rule of "lose" is about "rating", which the action does not set',
    ]);
  });
});

describe("a change set", () => {
  it("accepts the first slice's 'date finished'", () => {
    expect(issuesOf(ChangeSet, createDateFinishedChange())).toEqual([]);
  });

  it("is rejected with no operation, with one it does not offer, and with a draft that carries a version", () => {
    const change = createDateFinishedChange();
    const rename = {
      op: "renameProperty",
      type: "Book",
      from: "title",
      to: "name",
    };

    const versioned = {
      op: "addObjectType",
      objectType: { ...book(createBookOntology()) },
    };

    expect(issuesOf(ChangeSet, { ...change, operations: [] })).not.toEqual([]);
    expect(
      issuesOf(ChangeSet, { ...change, operations: [rename] }),
    ).not.toEqual([]);
    expect(
      issuesOf(ChangeSet, { ...change, operations: [versioned] }),
    ).not.toEqual([]);
  });
});

type OntologyInput = ReturnType<typeof createBookOntology>;
type ObjectTypeInput = OntologyInput["objectTypes"][number];

/** The fixture's one object type. */
function book(ontology: OntologyInput): ObjectTypeInput {
  const [type] = ontology.objectTypes;

  if (type === undefined) {
    throw new Error("the fixture ontology has no object type");
  }

  return type;
}

/** The book tracker with one more property on `Book`. */
function withProperty(property: unknown): unknown {
  const ontology = createBookOntology();
  const type = book(ontology);

  return {
    ...ontology,
    objectTypes: [{ ...type, properties: [...type.properties, property] }],
  };
}
