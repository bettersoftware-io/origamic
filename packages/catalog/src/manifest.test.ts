import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { Element, Ontology, validateApp } from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
  createCatalog,
} from "@origamic/spec/testing/bookTracker.ts";

import { catalog, contracts } from "./manifest.ts";

describe("the catalog", () => {
  it("imports spec and zod and nothing else, so the gateway can read it without React", () => {
    expect(
      packagesImportedFrom(join(import.meta.dirname, "manifest.ts")),
    ).toEqual(["@origamic/spec", "zod"]);
  });

  it("has a manifest entry for the Table: rows from a view, columns fixed, the selection from state", () => {
    expect(catalog.manifest.Table).toEqual({
      props: { rows: "view", columns: "fixed", selected: "state" },
      events: { select: ["id", "values"] },
    });
  });

  it("describes the five components as spec's book tracker expects them", () => {
    expect(catalog.manifest).toEqual(createCatalog().manifest);
    expect(Object.keys(contracts)).toEqual(Object.keys(catalog.manifest));
  });

  it("accepts the book tracker, with spec's every check", () => {
    expect(validated(createBookApp()).kind).toBe("valid");
  });

  it("reports a fixed value its schema refuses: a Select with no options", () => {
    expect(
      checked({
        component: "Select",
        props: { label: "Status", options: [], value: null },
      }),
    ).toEqual([
      {
        path: "ui.elements.statusFilter.props.options",
        message:
          'the "options" of a "Select": a Select offers at least one option',
      },
    ]);
  });

  it("reports a missing required prop", () => {
    expect(
      checked({
        component: "Select",
        props: { options: ["want"], value: null },
      }),
    ).toEqual([
      {
        path: "ui.elements.statusFilter.props.label",
        message: 'a "Select" needs "label"',
      },
    ]);
  });

  it("reports where inside a value its schema refuses it", () => {
    expect(
      checked({
        component: "Table",
        props: {
          rows: { $view: "books" },
          columns: [{ property: "title", label: "" }],
        },
      }),
    ).toEqual([
      {
        path: "ui.elements.statusFilter.props.columns.0.label",
        message: `the "columns" of a "Table": a column's label is not empty`,
      },
    ]);
  });

  it("reports a Form submit $event that names no field", () => {
    const fields = [
      { name: "title", label: "Title", input: "text" },
      { name: "rating", label: "Rating", input: "number" },
    ];

    expect(
      checked({
        component: "Form",
        props: { fields, submitLabel: "Add", mode: "create" },
        on: {
          submit: [
            {
              do: "invoke",
              action: "createBook",
              target: { $event: "id" },
              input: {
                title: { $event: "title" },
                author: { $event: "author" },
              },
            },
            { do: "set", state: "status", to: { $event: "rating" } },
          ],
        },
      }),
    ).toEqual([
      {
        path: "ui.elements.statusFilter.on.submit.0.target",
        message:
          'the "submit" of a "Form" carries its fields: title, rating; it has no "id"',
      },
      {
        path: "ui.elements.statusFilter.on.submit.0.input.author",
        message:
          'the "submit" of a "Form" carries its fields: title, rating; it has no "author"',
      },
    ]);
  });

  it("reports two fields of one name, and a select field with no options", () => {
    const fields = [
      { name: "title", label: "Title", input: "text" },
      { name: "title", label: "Status", input: "select" },
    ];

    expect(
      checked({
        component: "Form",
        props: { fields, submitLabel: "Add", mode: "create" },
      }),
    ).toEqual([
      {
        path: "ui.elements.statusFilter.props.fields.1.name",
        message: `the "fields" of a "Form": "title" names two fields of the form`,
      },
      {
        path: "ui.elements.statusFilter.props.fields.1.options",
        message: `the "fields" of a "Form": the select field "title" has no options`,
      },
    ]);
  });

  it("reports children on a component that shows none", () => {
    expect(
      checked({
        component: "Text",
        props: { text: "Books" },
        children: ["table"],
      }),
    ).toEqual([
      {
        path: "ui.elements.statusFilter.children",
        message: 'a "Text" shows no children; put them in a "Stack"',
      },
    ]);
    expect(checked({ component: "Stack", children: ["table"] })).toEqual([]);
  });

  it("leaves to checkApp what it judges: a reference, an unknown prop, an unknown component", () => {
    expect(
      checked({
        component: "Text",
        props: {
          text: { $state: "status" },
          tone: { $state: "status" },
          size: 3,
        },
      }),
    ).toEqual([]);
    expect(checked({ component: "Dropdown", props: { label: 3 } })).toEqual([]);
  });

  it("checks no submit $event against fields it cannot read", () => {
    expect(
      checked({
        component: "Form",
        props: { fields: [], submitLabel: "Add", mode: "create" },
        on: { submit: [{ do: "set", state: "status", to: { $event: "x" } }] },
      }),
    ).toEqual([
      {
        path: "ui.elements.statusFilter.props.fields",
        message: 'the "fields" of a "Form": a Form has at least one field',
      },
    ]);
  });
});

function checked(element: unknown): ReturnType<typeof catalog.checkElement> {
  return catalog.checkElement("statusFilter", Element.parse(element));
}

function validated(app: unknown): ReturnType<typeof validateApp> {
  return validateApp(app, Ontology.parse(createBookOntology()), catalog);
}

/** Every package the file at `entry` imports, and every file of ours it imports does, in order of name. */
function packagesImportedFrom(entry: string): string[] {
  const packages = new Set<string>();
  const seen = new Set<string>();
  const waiting = [entry];

  for (let file = waiting.pop(); file !== undefined; file = waiting.pop()) {
    if (!seen.has(file)) {
      seen.add(file);

      for (const [, specifier = ""] of readFileSync(file, "utf8").matchAll(
        /from "([^"]+)"/g,
      )) {
        if (specifier.startsWith(".")) {
          waiting.push(join(dirname(file), specifier));
        } else if (specifier.startsWith("#/")) {
          waiting.push(join(import.meta.dirname, specifier.slice(2)));
        } else {
          packages.add(specifier);
        }
      }
    }
  }

  return [...packages].sort();
}
