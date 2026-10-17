import { describe, expect, it, vi } from "vitest";

import { AppDraft } from "./binding.ts";
import { Ontology } from "./ontology.ts";
import { type Catalog, checkApp, validateApp } from "./references.ts";
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

describe("the wiring of an element", () => {
  it("a prop the component does not have is a problem", () => {
    const app = createBookApp();

    propsOf(app, "table").colour = "red";

    expect(problemsOf(app)).toEqual([
      {
        path: "ui.elements.table.props.colour",
        message:
          'a "Table" has no prop "colour"; it takes rows, columns, selected',
      },
    ]);
  });

  it("a $view on a prop that is not a view is a problem", () => {
    const app = createBookApp();

    propsOf(app, "statusFilter").label = { $view: "books" };
    propsOf(app, "statusFilter").value = { $view: "books" };

    expect(problemsOf(app)).toEqual([
      {
        path: "ui.elements.statusFilter.props.label",
        message: '"label" of a "Select" is not a view prop; it takes no $view',
      },
      {
        path: "ui.elements.statusFilter.props.value",
        message: '"value" of a "Select" is not a view prop; it takes no $view',
      },
    ]);
  });

  it("a $state on a fixed prop is a problem", () => {
    const app = createBookApp();

    propsOf(app, "table").columns = { $state: "status" };

    expect(problemsOf(app)).toEqual([
      {
        path: "ui.elements.table.props.columns",
        message: '"columns" of a "Table" is fixed; it takes no $state',
      },
    ]);
  });

  it("a view prop holds a $view and nothing else", () => {
    const app = createBookApp();

    propsOf(app, "table").rows = [];

    expect(problemsOf(app)).toEqual([
      {
        path: "ui.elements.table.props.rows",
        message: '"rows" of a "Table" takes a $view and nothing else',
      },
    ]);
  });

  it("a $event the event does not carry is a problem", () => {
    const app = createBookApp();

    elementOf(app, "table").on = {
      select: [
        { do: "set", state: "selected", to: { $event: "row" } },
        {
          do: "invoke",
          action: "updateBook",
          target: { $event: "key" },
          input: { rating: { $event: "stars" } },
        },
      ],
    };

    expect(problemsOf(app)).toEqual([
      {
        path: "ui.elements.table.on.select.0.to",
        message:
          'the "select" of a "Table" carries id, values; it has no "row"',
      },
      {
        path: "ui.elements.table.on.select.1.target",
        message:
          'the "select" of a "Table" carries id, values; it has no "key"',
      },
      {
        path: "ui.elements.table.on.select.1.input.rating",
        message:
          'the "select" of a "Table" carries id, values; it has no "stars"',
      },
    ]);
  });

  it("a $event of an event whose fields come from props is the catalog's to check", () => {
    const app = createBookApp();

    elementOf(app, "addForm").on = {
      submit: [{ do: "set", state: "selected", to: { $event: "row" } }],
    };

    expect(problemsOf(app)).toEqual([]);
  });

  it("a name every object has is not taken for a component, a prop or an event", () => {
    const app = createBookApp();
    const unselect: HandlersInput = [
      { do: "set", state: "selected", to: null },
    ];

    elementOf(app, "statusFilter").component = "constructor";
    elementOf(app, "table").props = { toString: "red" };
    elementOf(app, "addForm").on = { valueOf: unselect };

    expect(problemsOf(app).map(pathOf)).toEqual([
      "ui.elements.statusFilter.component",
      "ui.elements.table.props.toString",
      "ui.elements.addForm.on.valueOf",
    ]);
  });

  it("validateApp runs the schema, checkApp and the catalog, in that order", () => {
    const catalog = createFussyCatalog();
    const unparsed = createBookApp();
    const miswired = createBookApp();

    unparsed.ui.root = "home";
    propsOf(miswired, "table").colour = "red";

    expect(
      validateApp(unparsed, Ontology.parse(createBookOntology()), catalog),
    ).toEqual({
      kind: "invalid",
      problems: [
        { path: "ui.root", message: 'the root "home" is not an element' },
      ],
    });
    expect(catalog.checkElement).not.toHaveBeenCalled();
    expect(
      validateApp(miswired, Ontology.parse(createBookOntology()), catalog),
    ).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "ui.elements.table.props.colour",
          message:
            'a "Table" has no prop "colour"; it takes rows, columns, selected',
        },
        { path: "ui.elements.table.props.columns", message: "too few" },
      ],
    });
    expect(catalog.checkElement).toHaveBeenCalledTimes(5);
  });

  it("validateApp gives back the app it parsed when nothing is wrong", () => {
    expect(
      validateApp(
        createBookApp(),
        Ontology.parse(createBookOntology()),
        createCatalog(),
      ),
    ).toEqual({ kind: "valid", app: AppDraft.parse(createBookApp()) });
  });
});

type AppInput = ReturnType<typeof createBookApp>;
type OntologyInput = ReturnType<typeof createBookOntology>;
type ElementInput = ReturnType<typeof elementOf>;
type PropsInput = NonNullable<ElementInput["props"]>;
type HandlersInput = NonNullable<ElementInput["on"]>[string];

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
    createCatalog().manifest,
  );
}

function messagesOf(app: AppInput): string[] {
  return problemsOf(app).map(messageOf);
}

function messageOf(problem: Problem): string {
  return problem.message;
}

function pathOf(problem: Problem): string {
  return problem.path;
}

/** The props of an element of a fixture app, to change in place. */
function propsOf(app: AppInput, id: string): PropsInput {
  const element = elementOf(app, id);

  element.props ??= {};

  return element.props;
}

/** A catalog that refuses the table's columns, and records what it was asked. */
function createFussyCatalog(): Catalog {
  return {
    manifest: createCatalog().manifest,
    checkElement: vi.fn((id: string): Problem[] => {
      return id === "table"
        ? [{ path: "ui.elements.table.props.columns", message: "too few" }]
        : [];
    }),
  };
}
