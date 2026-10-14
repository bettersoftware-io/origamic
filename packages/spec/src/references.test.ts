import { describe, expect, it } from "vitest";

import { AppDraft } from "./binding.ts";
import { Ontology } from "./ontology.ts";
import { checkApp } from "./references.ts";
import {
  createBookApp,
  createBookOntology,
  createCatalog,
} from "./testing/bookTracker.ts";
import { elementOf } from "./testing/issues.ts";

describe("the references of an app", () => {
  it("find nothing wrong with the book tracker", () => {
    expect(problemsOf(createBookApp())).toEqual([]);
  });

  it("reject a binding to a type or an action at a version the ontology does not have", () => {
    const app = createBookApp();

    app.bindings.types = [
      { type: "Book", version: 2 },
      { type: "Author", version: 1 },
    ];
    app.bindings.actions = [
      { action: "createBook", version: 2 },
      { action: "updateBook", version: 1 },
    ];

    expect(messagesOf(app)).toEqual([
      '"Book@2" is not a type the ontology has; "Book" is at 1',
      '"Author@1" is not a type the ontology has',
      '"createBook@2" is not an action the ontology has; "createBook" is at 1',
    ]);
  });

  it("accept a binding to an older version, which is the compatibility check's to judge", () => {
    const ontology = createBookOntology();
    const [type] = ontology.objectTypes;

    ontology.objectTypes = type ? [{ ...type, version: 2 }] : [];

    expect(problemsOf(createBookApp(), ontology)).toEqual([]);
  });

  it("reject an app built against an ontology newer than the one it is checked with", () => {
    expect(messagesOf({ ...createBookApp(), ontologyVersion: 2 })).toEqual([
      "the app was built against ontology version 2, and the ontology is at 1",
    ]);
  });

  it("reject a component the catalog does not have, and an event it does not emit", () => {
    const app = createBookApp();

    elementOf(app, "statusFilter").component = "Dropdown";
    elementOf(app, "table").on = {
      hover: [{ do: "set", state: "selected", to: null }],
    };
    elementOf(app, "page").on = {
      click: [{ do: "set", state: "selected", to: null }],
    };

    expect(problemsOf(app)).toEqual([
      {
        path: "ui.elements.page.on.click",
        message: 'a "Stack" emits no "click"; it emits nothing',
      },
      {
        path: "ui.elements.statusFilter.component",
        message: '"statusFilter" is a "Dropdown", which is not in the catalog',
      },
      {
        path: "ui.elements.table.on.hover",
        message: 'a "Table" emits no "hover"; it emits select',
      },
    ]);
  });

  it("reject a view that filters or sorts by a property the type does not have", () => {
    const app = createBookApp();

    app.ui.views = {
      books: {
        type: "Book",
        filter: [{ property: "genre", op: "eq", value: "fiction" }],
        sort: [{ property: "pages", dir: "desc" }],
      },
    };

    expect(messagesOf(app)).toEqual([
      'the view "books" uses "genre", which "Book" does not have',
      'the view "books" uses "pages", which "Book" does not have',
    ]);
  });

  it("reject an invocation that sets what its action does not, or names no object for one that needs it", () => {
    const app = createBookApp();

    elementOf(app, "editForm").on = {
      submit: [
        {
          do: "invoke",
          action: "updateBook",
          input: { pages: { $event: "pages" } },
        },
      ],
    };

    expect(messagesOf(app)).toEqual([
      '"updateBook" does not set "pages"',
      '"updateBook" acts on an object, and the handler names no target',
    ]);
  });

  it("let a link take the object it links to, and nothing else", () => {
    const ontology = createBookOntology();
    const app = createBookApp();

    ontology.linkTypes = [
      { name: "Sequel", from: "Book", to: "Book", cardinality: "one-to-one" },
    ];
    ontology.actionTypes = [
      ...(ontology.actionTypes ?? []),
      { name: "chain", version: 1, kind: "link", linkType: "Sequel" },
    ];
    app.bindings.actions = [{ action: "chain", version: 1 }];
    elementOf(app, "addForm").on = {
      submit: [
        {
          do: "invoke",
          action: "chain",
          target: { $state: "selected" },
          input: { to: { $event: "id" }, from: null },
        },
      ],
    };
    elementOf(app, "editForm").on = {};

    expect(problemsOf(app, ontology).map(messageOf)).toEqual([
      '"chain" does not set "from"',
    ]);
  });
});

type AppInput = ReturnType<typeof createBookApp>;
type OntologyInput = ReturnType<typeof createBookOntology>;

interface Problem {
  path: string;
  message: string;
}

function problemsOf(
  app: AppInput,
  ontology: OntologyInput = createBookOntology(),
): Problem[] {
  return checkApp(
    AppDraft.parse(app),
    Ontology.parse(ontology),
    createCatalog(),
  );
}

function messagesOf(app: AppInput): string[] {
  return problemsOf(app).map(messageOf);
}

function messageOf(problem: Problem): string {
  return problem.message;
}
