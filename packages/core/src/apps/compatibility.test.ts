import { describe, expect, it } from "vitest";

import { App, applyChangeSet, ChangeSet, Ontology } from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";
import { elementOf } from "@origamic/spec/testing/issues.ts";

import { checkCompatibility } from "./compatibility.ts";

describe("checkCompatibility", () => {
  it("the book app built on ontology v1 is compatible with v2 after the date-finished change", () => {
    const revised = applied(ChangeSet.parse(createDateFinishedChange()));

    expect(checkCompatibility(createSavedBookApp(), revised)).toEqual({
      kind: "compatible",
    });
  });

  it("the book app is compatible with the ontology it was built on", () => {
    expect(checkCompatibility(createSavedBookApp(), createOntology())).toEqual({
      kind: "compatible",
    });
  });

  it("a deprecated property the app's view sorts by is a break of the type's binding", () => {
    const app = createBookApp();
    const view = app.ui.views?.books;

    if (view === undefined) {
      throw new Error("the fixture app has no view books");
    }

    view.sort = [{ property: "rating", dir: "desc" }];
    leaveRatingOutOfTheForms(app);

    expect(
      checkCompatibility(
        App.parse({ ...app, version: 1 }),
        createOntologyWithoutRating(),
      ),
    ).toEqual({
      kind: "report",
      breaks: [{ binding: "Book@1", property: "rating", reason: "deprecated" }],
    });
  });

  it("a deprecated property a handler sets is a break of the type, and of each action that no longer sets it", () => {
    const result = checkCompatibility(
      createSavedBookApp(),
      createOntologyWithoutRating(),
    );

    expect(result).toEqual({
      kind: "report",
      breaks: [
        { binding: "Book@1", property: "rating", reason: "deprecated" },
        {
          binding: "createBook@1",
          property: "rating",
          reason: "no longer set",
        },
        {
          binding: "updateBook@1",
          property: "rating",
          reason: "no longer set",
        },
      ],
    });
  });

  it("a deprecated property a view filters on is a break", () => {
    const app = createBookApp();

    app.ui.views = {
      books: {
        type: "Book",
        filter: [{ property: "rating", op: "gt", value: 3 }],
      },
    };
    leaveRatingOutOfTheForms(app);

    expect(
      checkCompatibility(
        App.parse({ ...app, version: 1 }),
        createOntologyWithoutRating(),
      ),
    ).toEqual({
      kind: "report",
      breaks: [{ binding: "Book@1", property: "rating", reason: "deprecated" }],
    });
  });

  it("a bound type or action the ontology does not have is missing", () => {
    const app = createBookApp();

    app.bindings.types.push({ type: "Film", version: 1 });
    app.bindings.actions?.push({ action: "deleteFilm", version: 1 });

    expect(
      checkCompatibility(App.parse({ ...app, version: 1 }), createOntology()),
    ).toEqual({
      kind: "report",
      breaks: [
        { binding: "Film@1", reason: "missing" },
        { binding: "deleteFilm@1", reason: "missing" },
      ],
    });
  });

  it("a binding to a version the ontology has not reached is missing", () => {
    const app = createBookApp();

    app.bindings.types = [{ type: "Book", version: 3 }];
    app.bindings.actions = [
      { action: "createBook", version: 1 },
      { action: "updateBook", version: 2 },
    ];

    expect(
      checkCompatibility(App.parse({ ...app, version: 1 }), createOntology()),
    ).toEqual({
      kind: "report",
      breaks: [
        { binding: "Book@3", reason: "missing" },
        { binding: "updateBook@2", reason: "missing" },
      ],
    });
  });

  it("a property the bound type does not have is missing", () => {
    const app = createBookApp();

    app.ui.views = {
      books: { type: "Book", sort: [{ property: "pages", dir: "asc" }] },
    };

    expect(
      checkCompatibility(App.parse({ ...app, version: 1 }), createOntology()),
    ).toEqual({
      kind: "report",
      breaks: [{ binding: "Book@1", property: "pages", reason: "missing" }],
    });
  });

  it("an inherited name is not taken for a type, an action or a property", () => {
    const app = createBookApp();

    app.bindings.types.push({ type: "Constructor", version: 1 });
    app.ui.views = {
      books: { type: "Book", sort: [{ property: "constructor", dir: "asc" }] },
    };

    expect(
      checkCompatibility(App.parse({ ...app, version: 1 }), createOntology()),
    ).toEqual({
      kind: "report",
      breaks: [
        { binding: "Book@1", property: "constructor", reason: "missing" },
        { binding: "Constructor@1", reason: "missing" },
      ],
    });
  });
});

function createSavedBookApp(): App {
  return App.parse({ ...createBookApp(), version: 1 });
}

function createOntology(): Ontology {
  return Ontology.parse(createBookOntology());
}

/** `rating` deprecated, so `createBook@2` and `updateBook@2` no longer set it. */
function createOntologyWithoutRating(): Ontology {
  return applied(
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

function applied(change: ChangeSet): Ontology {
  const result = applyChangeSet(createOntology(), change);

  if (result.kind !== "applied") {
    throw new Error(
      `the fixture change did not apply: ${JSON.stringify(result)}`,
    );
  }

  return result.ontology;
}

type AppInput = ReturnType<typeof createBookApp>;

/** The forms of the fixture app stop passing `rating` to their actions. */
function leaveRatingOutOfTheForms(app: AppInput): void {
  for (const id of ["addForm", "editForm"]) {
    for (const handler of elementOf(app, id).on?.submit ?? []) {
      if (handler.do === "invoke" && handler.input !== undefined) {
        handler.input = Object.fromEntries(
          Object.entries(handler.input).filter(([field]) => {
            return field !== "rating";
          }),
        );
      }
    }
  }
}
