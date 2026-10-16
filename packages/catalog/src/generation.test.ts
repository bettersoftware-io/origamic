import { describe, expect, it } from "vitest";

import { ChangeSet } from "@origamic/spec";
import {
  createBookApp,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

import {
  type Generated,
  generationSchema,
  type JsonSchema,
  readGenerated,
} from "./manifest.ts";

describe("what the model is held to", () => {
  it("has additionalProperties: false on every object, and no $ref that reaches itself", () => {
    const schema = generationSchema();

    expect(openObjectsIn(schema)).toEqual([]);
    expect(refsReachingThemselves(schema)).toEqual([]);
  });

  it("writes a union as anyOf, never oneOf", () => {
    expect(JSON.stringify(generationSchema())).not.toContain('"oneOf"');
  });

  it("offers one closed object per component, with what each prop accepts by kind", () => {
    const element = elementSchemaOf(generationSchema(), "Table");

    expect(element.required).toEqual(["id", "component", "props"]);
    expect(element.properties?.props).toMatchObject({
      required: ["rows", "columns"],
      properties: {
        rows: {
          type: "object",
          properties: { $view: { type: "string" } },
          additionalProperties: false,
        },
        selected: {
          anyOf: [
            { anyOf: [{ type: "string" }, { type: "null" }] },
            { properties: { $state: { type: "string" } } },
          ],
        },
      },
    });
  });

  it("offers children to the Stack alone, the only component that shows them", () => {
    const schema = generationSchema();

    expect(elementSchemaOf(schema, "Stack").properties).toHaveProperty(
      "children",
    );
    expect(elementSchemaOf(schema, "Form").properties).not.toHaveProperty(
      "children",
    );
  });

  it("carries each prop's note to the model, on a state prop's choice of a value or a $state too", () => {
    const select = elementSchemaOf(generationSchema(), "Select");

    expect(select.properties?.props?.properties?.emptyLabel).toMatchObject({
      description:
        "The label of the empty choice, which emits null. Without it there is no empty choice.",
    });
    expect(select.properties?.props?.properties?.value).toMatchObject({
      description: "The chosen value, or null for the empty choice.",
      anyOf: [{ type: ["string", "null"] }, { required: ["$state"] }],
    });
  });

  it("offers a state prop it cannot hold to a closed schema by its $state only", () => {
    const form = elementSchemaOf(generationSchema(), "Form");

    expect(form.properties?.props?.properties?.values).toMatchObject({
      type: "object",
      properties: { $state: { type: "string" } },
      required: ["$state"],
    });
  });
});

describe("reading what the model wrote", () => {
  it("gives back the book tracker's ui from the book tracker as the model writes it", () => {
    const read = readGenerated(createModelReply());

    expect(read).toEqual({
      kind: "read",
      generated: {
        explanation: "A list of books, with a filter and two forms.",
        operations: null,
        app: {
          name: "Books I'm reading",
          types: ["Book"],
          actions: ["createBook", "updateBook"],
          ui: createBookApp().ui,
        },
      } satisfies Generated,
    });
  });

  it("reads a change set's operations as spec parses them", () => {
    const operations = createDateFinishedChange().operations;
    const read = readGenerated({ ...createModelReply(), operations });

    expect(read.kind === "read" && read.generated.operations).toEqual(
      ChangeSet.shape.operations.parse(operations),
    );
  });

  it("refuses a prop a component does not have, saying where", () => {
    const reply = createModelReply();
    const [page] = reply.app.ui.elements;

    reply.app.ui.elements[0] = { ...page, props: { gap: "small", size: 3 } };

    expect(readGenerated(reply)).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "app.ui.elements.0.props",
          message: 'Unrecognized key: "size"',
        },
      ],
    });
  });

  it("refuses children on a component that shows none", () => {
    const reply = createModelReply();

    reply.app.ui.elements = [
      ...reply.app.ui.elements,
      { id: "note", component: "Text", props: { text: "x" }, children: [] },
    ];

    expect(readGenerated(reply)).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "app.ui.elements.5",
          message: 'Unrecognized key: "children"',
        },
      ],
    });
  });

  it("refuses an element or a view named __proto__, as spec's maps do", () => {
    const text = JSON.stringify(createModelReply())
      .replace(
        '"elements":[',
        '"elements":[{"id":"__proto__","component":"Text","props":{"text":"x"}},',
      )
      .replace('"views":[', '"views":[{"id":"__proto__","type":"Book"},');

    expect(readGenerated(JSON.parse(text))).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "app.ui.elements.0.id",
          message: '"__proto__" is not a key a spec may use',
        },
        {
          path: "app.ui.views.0.id",
          message: '"__proto__" is not a key a spec may use',
        },
      ],
    });
  });

  it("refuses two elements, two views or two state keys of one name", () => {
    const reply = createModelReply();
    const { elements, views, state } = reply.app.ui;

    reply.app.ui.elements = [...elements, { id: "page", component: "Stack" }];
    reply.app.ui.views = [...views, { id: "books", type: "Book" }];
    reply.app.ui.state = [...state, { key: "status" }];

    expect(readGenerated(reply)).toEqual({
      kind: "invalid",
      problems: [
        {
          path: "app.ui.elements.5.id",
          message: '"page" names two elements',
        },
        { path: "app.ui.views.1.id", message: '"books" names two views' },
        {
          path: "app.ui.state.3.key",
          message: '"status" names two state keys',
        },
      ],
    });
  });
});

interface ModelReply {
  explanation: string;
  operations: unknown;
  app: ModelApp;
}

interface ModelApp {
  name: string;
  types: string[];
  actions: string[];
  ui: ModelUi;
}

/** Elements, views and state as the model writes them: lists of entries, each named by an id or a key. */
interface ModelUi {
  root: string;
  elements: Entry[];
  views: Entry[];
  state: Entry[];
}

type Entry = Record<string, unknown>;

interface SchemaNode {
  type?: string | string[];
  properties?: Record<string, SchemaNode>;
  required?: string[];
  description?: string;
  additionalProperties?: unknown;
  anyOf?: SchemaNode[];
  $ref?: string;
  const?: unknown;
}

/** The path of every object in `schema` that does not say `additionalProperties: false`. */
function openObjectsIn(schema: JsonSchema): string[] {
  return nodesOf(schema, "#")
    .filter(([, node]) => {
      return node.type === "object" && node.additionalProperties !== false;
    })
    .map(([path]) => {
      return path;
    });
}

/** Each definition that, following `$ref`s, comes back to itself. */
function refsReachingThemselves(schema: JsonSchema): string[] {
  const definitions = Object.entries(schema.$defs ?? {});
  const targets = new Map(
    definitions.map(([name, definition]) => {
      return [
        `#/$defs/${name}`,
        nodesOf(definition, name).flatMap(([, node]) => {
          return node.$ref === undefined ? [] : [node.$ref];
        }),
      ];
    }),
  );

  return [...targets.keys()].filter((start) => {
    const waiting = [...(targets.get(start) ?? [])];
    const seen = new Set<string>();

    for (let ref = waiting.pop(); ref !== undefined; ref = waiting.pop()) {
      if (ref === start) {
        return true;
      }

      if (!seen.has(ref)) {
        seen.add(ref);
        waiting.push(...(targets.get(ref) ?? []));
      }
    }

    return false;
  });
}

/** Every object node under `value`, with its path. */
function nodesOf(value: unknown, path: string): [string, SchemaNode][] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      return nodesOf(item, `${path}/${index}`);
    });
  }

  if (typeof value !== "object" || value === null) {
    return [];
  }

  return [
    [path, value],
    ...Object.entries(value).flatMap(([key, inner]) => {
      return nodesOf(inner, `${path}/${key}`);
    }),
  ];
}

function elementSchemaOf(schema: JsonSchema, component: string): SchemaNode {
  const found = nodesOf(schema, "#").find(([, node]) => {
    return node.properties?.component?.const === component;
  });

  if (found === undefined) {
    throw new Error(`the schema has no element for "${component}"`);
  }

  return found[1];
}

/** The book tracker of spec's fixture, as the model writes it: arrays with an id where the spec has maps (ADR-0011). */
function createModelReply(): ModelReply {
  const fields = [
    { name: "title", label: "Title", input: "text" },
    { name: "author", label: "Author", input: "text" },
    {
      name: "status",
      label: "Status",
      input: "select",
      options: ["want", "reading", "done"],
    },
    { name: "rating", label: "Rating", input: "number" },
  ];

  const input = ["title", "author", "status", "rating"].map((field) => {
    return { field, value: { $event: field } };
  });

  return {
    explanation: "A list of books, with a filter and two forms.",
    operations: null,
    app: {
      name: "Books I'm reading",
      types: ["Book"],
      actions: ["createBook", "updateBook"],
      ui: {
        root: "page",
        elements: [
          {
            id: "page",
            component: "Stack",
            children: ["statusFilter", "table", "addForm", "editForm"],
          },
          {
            id: "statusFilter",
            component: "Select",
            props: {
              label: "Status",
              options: ["want", "reading", "done"],
              emptyLabel: "Every status",
              value: { $state: "status" },
            },
            on: {
              change: [{ do: "set", state: "status", to: { $event: "value" } }],
            },
          },
          {
            id: "table",
            component: "Table",
            props: {
              rows: { $view: "books" },
              columns: [
                { property: "title", label: "Title" },
                { property: "author", label: "Author" },
                { property: "status", label: "Status" },
                { property: "rating", label: "Rating" },
              ],
              selected: { $state: "selected" },
            },
            on: {
              select: [
                { do: "set", state: "selected", to: { $event: "id" } },
                { do: "set", state: "editing", to: { $event: "values" } },
              ],
            },
          },
          {
            id: "addForm",
            component: "Form",
            props: { fields, submitLabel: "Add", mode: "create" },
            on: { submit: [{ do: "invoke", action: "createBook", input }] },
          },
          {
            id: "editForm",
            component: "Form",
            props: {
              fields,
              submitLabel: "Save",
              mode: "edit",
              values: { $state: "editing" },
            },
            on: {
              submit: [
                {
                  do: "invoke",
                  action: "updateBook",
                  target: { $state: "selected" },
                  input,
                },
                { do: "set", state: "selected", to: null },
                { do: "set", state: "editing", to: null },
              ],
            },
          },
        ],
        views: [
          {
            id: "books",
            type: "Book",
            filter: [
              { property: "status", op: "eq", value: { $state: "status" } },
            ],
            sort: [{ property: "title", dir: "asc" }],
          },
        ],
        state: [
          { key: "status", initial: null },
          { key: "selected" },
          { key: "editing" },
        ],
      },
    },
  };
}
