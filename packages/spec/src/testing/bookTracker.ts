import type { z } from "zod";

import type { AppDraft } from "../binding.ts";
import type { ChangeSet, Ontology } from "../ontology.ts";
import type { CatalogManifest } from "../references.ts";
import type { WorkspaceDraft } from "../workspace.ts";

// The first slice's book tracker, as each schema takes it in. Each factory
// returns a fresh copy, so a test may change what it gets.

type OntologyInput = z.input<typeof Ontology>;
type AppInput = z.input<typeof AppDraft>;
type ChangeSetInput = z.input<typeof ChangeSet>;
type WorkspaceInput = z.input<typeof WorkspaceDraft>;

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

/** Slice step 7: "add a 'date finished' field". */
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
      state: { status: { initial: null }, selected: {} },
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
            value: { $state: "status" },
          },
          on: {
            change: [{ do: "set", state: "status", to: { $event: "value" } }],
          },
        },
        table: {
          component: "Table",
          props: {
            rows: { $view: "books" },
            columns: [{ property: "title", label: "Title" }],
          },
          on: {
            select: [{ do: "set", state: "selected", to: { $event: "id" } }],
          },
        },
        addForm: {
          component: "Form",
          props: { submitLabel: "Add" },
          on: {
            submit: [
              {
                do: "invoke",
                action: "createBook",
                input: {
                  title: { $event: "title" },
                  status: { $event: "status" },
                },
              },
            ],
          },
        },
        editForm: {
          component: "Form",
          props: { submitLabel: "Save" },
          on: {
            submit: [
              {
                do: "invoke",
                action: "updateBook",
                target: { $state: "selected" },
                input: { rating: { $event: "rating" } },
              },
              { do: "set", state: "selected", to: null },
            ],
          },
        },
      },
    },
  };
}

export function createCatalog(): CatalogManifest {
  return {
    Stack: { events: [] },
    Select: { events: ["change"] },
    Table: { events: ["select"] },
    Form: { events: ["submit"] },
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
