import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createBookApp } from "./testing/bookTracker.ts";
import { elementOf, issuesOf, problemsIn } from "./testing/issues.ts";
import { UiSpec } from "./ui-spec.ts";

// Property tests: fast-check makes the specs, of any shape up to 40
// elements deep, and shrinks one that fails to the smallest that still does.
describe("a flat spec, whatever the shape of its tree", () => {
  it("is accepted when every element hangs from the root once", () => {
    fc.assert(
      fc.property(tree, (spec) => {
        expect(issuesOf(UiSpec, spec)).toEqual([]);
      }),
    );
  });

  it("is rejected when a child names an element that is not there", () => {
    fc.assert(
      fc.property(tree, fc.nat(), (spec, pick) => {
        const gone = pickNonRoot(spec, pick);

        delete spec.elements[gone];

        expect(issuesOf(UiSpec, spec)).toContainEqual(
          expect.stringContaining(`a child "${gone}" that is not an element`),
        );
      }),
    );
  });

  it("is rejected when an element has two parents", () => {
    fc.assert(
      fc.property(tree, fc.nat(), (spec, pick) => {
        const child = pickNonRoot(spec, pick);

        root(spec).children.push(child);

        expect(issuesOf(UiSpec, spec)).toContainEqual(
          expect.stringContaining(`"${child}" is a child of both`),
        );
      }),
    );
  });

  it("is rejected when an element is cut off from the root, in a loop of its own", () => {
    fc.assert(
      fc.property(tree, fc.nat(), (spec, pick) => {
        const looped = pickNonRoot(spec, pick);

        for (const element of Object.values(spec.elements)) {
          element.children = element.children.filter((child) => {
            return child !== looped;
          });
        }

        spec.elements[looped]?.children.push(looped);

        expect(issuesOf(UiSpec, spec)).toContain(
          `"${looped}" is not reached from the root "e0"; it may be part of a loop`,
        );
      }),
    );
  });
});

describe("a UI spec", () => {
  it("accepts the book tracker's", () => {
    expect(issuesOf(UiSpec, createBookApp().ui)).toEqual([]);
  });

  it("has a root that is an element and nobody's child", () => {
    const rootless = createBookApp();
    const adopted = createBookApp();

    rootless.ui.root = "home";
    elementOf(adopted, "table").children = ["page"];

    expect(issuesOf(UiSpec, rootless.ui)).toEqual([
      'the root "home" is not an element',
    ]);
    expect(issuesOf(UiSpec, adopted.ui)).toContain(
      '"table" has the root "page" as a child',
    );
  });

  it("reads and sets only the views and the state it declares", () => {
    const app = createBookApp();
    const table = elementOf(app, "table");

    table.props = { rows: { $view: "shelves" }, empty: { $state: "hint" } };
    table.on = {
      select: [
        { do: "set", state: "chosen", to: { $state: "picked" } },
        {
          do: "invoke",
          action: "updateBook",
          target: { $state: "row" },
          input: { title: { $state: "draft" } },
        },
      ],
    };
    app.ui.views = {
      books: {
        type: "Book",
        filter: [{ property: "status", op: "eq", value: { $state: "shelf" } }],
      },
    };

    expect(issuesOf(UiSpec, app.ui)).toEqual([
      '"shelves" is not a declared view',
      '"hint" is not declared in state',
      'a handler sets "chosen", which is not declared in state',
      '"picked" is not declared in state',
      '"row" is not declared in state',
      '"draft" is not declared in state',
      '"shelf" is not declared in state',
    ]);
  });

  it("takes no name every object inherits for an element, a view or a state key", () => {
    const rootless = {
      root: "constructor",
      elements: { page: { component: "Stack" } },
    };

    const inherited = {
      root: "page",
      elements: {
        page: {
          component: "Stack",
          children: ["toString"],
          props: {
            rows: { $view: "valueOf" },
            value: { $state: "hasOwnProperty" },
          },
          on: { change: [{ do: "set", state: "constructor", to: null }] },
        },
      },
    };

    expect(problemsIn(UiSpec, rootless)).toEqual([
      { path: "root", message: 'the root "constructor" is not an element' },
    ]);
    expect(problemsIn(UiSpec, inherited)).toEqual([
      {
        path: "elements.page.children.0",
        message: '"page" has a child "toString" that is not an element',
      },
      {
        path: "elements.page.props.rows",
        message: '"valueOf" is not a declared view',
      },
      {
        path: "elements.page.props.value",
        message: '"hasOwnProperty" is not declared in state',
      },
      {
        path: "elements.page.on.change.0.state",
        message: 'a handler sets "constructor", which is not declared in state',
      },
    ]);
  });

  it("refuses a __proto__ key, which JSON.parse keeps and a record would drop", () => {
    const asElement = JSON.parse(
      '{"root": "page", "elements": {"page": {"component": "Stack"}, "__proto__": {"component": "Stack"}}}',
    );

    const asProp = JSON.parse(
      '{"root": "page", "elements": {"page": {"component": "Stack", "props": {"__proto__": 1}}}}',
    );

    expect(problemsIn(UiSpec, asElement)).toEqual([
      {
        path: "elements.__proto__",
        message: '"__proto__" is not a key a spec may use',
      },
    ]);
    expect(problemsIn(UiSpec, asProp)).toEqual([
      {
        path: "elements.page.props.__proto__",
        message: '"__proto__" is not a key a spec may use',
      },
    ]);
  });

  it("does not take a misspelt reference, or a key it does not know, for data", () => {
    const misspelt = createBookApp();
    const unknownKey = createBookApp();

    elementOf(misspelt, "table").props = { rows: { $veiw: "books" } };
    unknownKey.ui.elements.table = { component: "Table", childs: [] } as never;

    expect(issuesOf(UiSpec, misspelt.ui)).not.toEqual([]);
    expect(issuesOf(UiSpec, unknownKey.ui)).not.toEqual([]);
  });
});

interface Node {
  component: string;
  children: string[];
}

interface Tree {
  root: string;
  elements: Record<string, Node>;
}

/** Up to 41 elements, `e0` the root; each other one hangs from an element made before it, so every shape of tree can come out. */
const tree = fc
  .array(fc.nat(), { minLength: 1, maxLength: 40 })
  .map((parents) => {
    const elements: Record<string, Node> = {
      e0: { component: "Box", children: [] },
    };

    parents.forEach((seed, index) => {
      const id = `e${index + 1}`;

      elements[id] = { component: "Box", children: [] };
      elements[`e${seed % (index + 1)}`]?.children.push(id);
    });

    return { root: "e0", elements };
  });

function pickNonRoot(spec: Tree, pick: number): string {
  const others = Object.keys(spec.elements).filter((id) => {
    return id !== spec.root;
  });

  return others[pick % others.length] ?? spec.root;
}

function root(spec: Tree): Node {
  const node = spec.elements[spec.root];

  if (node === undefined) {
    throw new Error("a generated tree always has its root");
  }

  return node;
}
