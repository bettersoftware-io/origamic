import type { z } from "zod";

import type { AppDraft } from "../binding.ts";
import type { JsonValue } from "../common.ts";
import type { ChangeSet, Ontology } from "../ontology.ts";
import type { Catalog, Problem } from "../references.ts";
import type { WorkspaceDraft } from "../workspace.ts";

// The first slice's book tracker, as each schema takes it in. Each factory
// returns a fresh copy, so a test may change what it gets.

type OntologyInput = z.input<typeof Ontology>;
type AppInput = z.input<typeof AppDraft>;
type ChangeSetInput = z.input<typeof ChangeSet>;
type WorkspaceInput = z.input<typeof WorkspaceDraft>;
type ElementInput = AppInput["ui"]["elements"][string];

/** A field of a `Form`: a JSON object, named by the property it sets. */
type Field = Record<string, JsonValue> & { name: string };

interface EventRead {
  $event: string;
}

export function createBookOntology(): OntologyInput {
  return {
    format: 1,
    version: 1,
    objectTypes: [
      {
        name: "Book",
        version: 1,
        titleProperty: "title",
        properties: [
          { name: "title", type: "string", required: true },
          { name: "author", type: "string" },
          {
            name: "status",
            type: "enum",
            values: ["want", "reading", "done"],
            required: true,
            default: "want",
          },
          { name: "rating", type: "integer" },
        ],
      },
    ],
    actionTypes: [
      {
        name: "createBook",
        version: 1,
        kind: "create",
        type: "Book",
        fields: ["title", "author", "status", "rating"],
        rules: [{ kind: "range", property: "rating", min: 1, max: 5 }],
      },
      {
        name: "updateBook",
        version: 1,
        kind: "update",
        type: "Book",
        fields: ["title", "author", "status", "rating"],
        rules: [{ kind: "range", property: "rating", min: 1, max: 5 }],
      },
    ],
  };
}

/** Slice step 7: "add a 'date finished' field". `updateBook` keeps everything it had, and also sets the date. */
export function createDateFinishedChange(): ChangeSetInput {
  return {
    format: 1,
    baseVersion: 1,
    operations: [
      {
        op: "addProperty",
        type: "Book",
        property: { name: "dateFinished", type: "date" },
      },
      {
        op: "replaceActionType",
        actionType: {
          name: "updateBook",
          kind: "update",
          type: "Book",
          fields: ["title", "author", "status", "rating", "dateFinished"],
          rules: [{ kind: "range", property: "rating", min: 1, max: 5 }],
        },
      },
    ],
  };
}

export function createBookApp(): AppInput {
  return {
    format: 1,
    id: "books",
    name: "Books I'm reading",
    ontologyVersion: 1,
    bindings: {
      types: [{ type: "Book", version: 1 }],
      actions: [
        { action: "createBook", version: 1 },
        { action: "updateBook", version: 1 },
      ],
    },
    ui: {
      root: "page",
      state: { status: { initial: null }, selected: {}, editing: {} },
      views: {
        books: {
          type: "Book",
          filter: [
            { property: "status", op: "eq", value: { $state: "status" } },
          ],
          sort: [{ property: "title", dir: "asc" }],
        },
      },
      elements: {
        page: {
          component: "Stack",
          children: ["statusFilter", "table", "addForm", "editForm"],
        },
        statusFilter: {
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
        table: createTable(createColumns()),
        addForm: {
          component: "Form",
          props: { fields: createFields(), submitLabel: "Add", mode: "create" },
          on: {
            submit: [
              {
                do: "invoke",
                action: "createBook",
                input: inputFrom(createFields()),
              },
            ],
          },
        },
        editForm: createEditForm(createFields()),
      },
    },
  };
}

/** Slice step 7: the book tracker revised for `createDateFinishedChange`, against the ontology it yields. */
export function createDateFinishedApp(): AppInput {
  const app = createBookApp();

  return {
    ...app,
    ontologyVersion: 2,
    bindings: {
      types: [{ type: "Book", version: 2 }],
      actions: [
        { action: "createBook", version: 1 },
        { action: "updateBook", version: 2 },
      ],
    },
    ui: {
      ...app.ui,
      elements: {
        ...app.ui.elements,
        table: createTable([
          ...createColumns(),
          { property: "dateFinished", label: "Finished" },
        ]),
        editForm: createEditForm([
          ...createFields(),
          { name: "dateFinished", label: "Finished", input: "date" },
        ]),
      },
    },
  };
}

/** The five components as the catalog's manifest describes them. Their props' schemas are the catalog's to check, so this one finds nothing there. */
export function createCatalog(): Catalog {
  return {
    manifest: {
      Stack: { props: { gap: "fixed" }, events: {} },
      Text: { props: { text: "state", tone: "fixed" }, events: {} },
      Select: {
        props: {
          label: "fixed",
          options: "fixed",
          emptyLabel: "fixed",
          value: "state",
        },
        events: { change: ["value"] },
      },
      Table: {
        props: { rows: "view", columns: "fixed", selected: "state" },
        events: { select: ["id", "values"] },
      },
      Form: {
        props: {
          fields: "fixed",
          submitLabel: "fixed",
          mode: "fixed",
          values: "state",
        },
        events: { submit: null },
      },
    },
    checkElement(): Problem[] {
      return [];
    },
  };
}

export function createWorkspace(): WorkspaceInput {
  return {
    format: 1,
    id: "reading",
    name: "Reading",
    panels: {
      books: { app: "books", appVersion: 1 },
      notes: { app: "notes", appVersion: 3 },
    },
    layout: {
      kind: "split",
      direction: "row",
      parts: [
        { size: 2, layout: { kind: "panel", panel: "books" } },
        {
          size: 1,
          layout: { kind: "tabs", panels: ["notes"], active: "notes" },
        },
      ],
    },
  };
}

function createColumns(): JsonValue[] {
  return [
    { property: "title", label: "Title" },
    { property: "author", label: "Author" },
    { property: "status", label: "Status" },
    { property: "rating", label: "Rating" },
  ];
}

function createFields(): Field[] {
  return [
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
}

/** Selecting a row keeps its id, for the edit form's target, and its values, for the edit form to show. */
function createTable(columns: JsonValue[]): ElementInput {
  return {
    component: "Table",
    props: {
      rows: { $view: "books" },
      columns,
      selected: { $state: "selected" },
    },
    on: {
      select: [
        { do: "set", state: "selected", to: { $event: "id" } },
        { do: "set", state: "editing", to: { $event: "values" } },
      ],
    },
  };
}

function createEditForm(fields: Field[]): ElementInput {
  return {
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
          input: inputFrom(fields),
        },
        { do: "set", state: "selected", to: null },
        { do: "set", state: "editing", to: null },
      ],
    },
  };
}

/** A form submits one field per entry of its `fields`; this passes each to the action under the same name. */
function inputFrom(fields: Field[]): Record<string, EventRead> {
  return Object.fromEntries(
    fields.map((field) => {
      return [field.name, { $event: field.name }];
    }),
  );
}
