import { App, GenerationRequest, Ontology } from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

// The first slice's book tracker as the model writes it (ADR-0011): elements,
// views and state as lists, each entry named by its id or key, types and
// actions by name alone. Each factory returns a fresh copy, so a test may
// change what it gets.

/** The reply as the model writes it, before `readGenerated` reads it. */
export interface WrittenReply {
  explanation: string;
  operations: unknown[] | null;
  app: WrittenApp;
}

interface WrittenApp {
  name: string;
  types: string[];
  actions: string[];
  ui: WrittenUi;
}

interface WrittenUi {
  root: string;
  elements: Entry[];
  views: Entry[];
  state: Entry[];
}

type Entry = Record<string, unknown>;

/** Slice step 1: the builder's first request, against an owner with no ontology yet. */
export function createFirstRequest(): GenerationRequest {
  return GenerationRequest.parse({
    format: 1,
    intent:
      "a simple tracker for the books I'm reading, with title, author, status (want / reading / done) and a rating",
    ontology: { format: 1, version: 0, objectTypes: [] },
  });
}

/** Slice step 7: "add a 'date finished' field", to the saved book tracker at ontology version 1. */
export function createRevisionRequest(): GenerationRequest {
  return GenerationRequest.parse({
    format: 1,
    intent: "add a 'date finished' field",
    ontology: Ontology.parse(createBookOntology()),
    app: App.parse({ ...createBookApp(), version: 1 }),
  });
}

/** Slice steps 2 and 3: the `Book` type, its two actions, and the app over them. */
export function createFirstReply(): WrittenReply {
  const { objectTypes, actionTypes } = createBookOntology();

  return {
    explanation:
      "A Book type with two actions, and a table, a filter and two forms.",
    operations: [
      ...objectTypes.map(({ version: _, ...objectType }) => {
        return { op: "addObjectType", objectType };
      }),
      ...(actionTypes ?? []).map(({ version: _, ...actionType }) => {
        return { op: "addActionType", actionType };
      }),
    ],
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
          createTable(createColumns()),
          {
            id: "addForm",
            component: "Form",
            props: {
              fields: createFields(),
              submitLabel: "Add",
              mode: "create",
            },
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
          createEditForm(createFields()),
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

/** Slice step 7: the date-finished change set, and the app revised to show and edit the date. */
export function createDateFinishedReply(): WrittenReply {
  const reply = createFirstReply();
  const fields = [
    ...createFields(),
    { name: "dateFinished", label: "Finished", input: "date" },
  ];

  return {
    explanation:
      "A date-finished property, shown in the table and edited in the form.",
    operations: createDateFinishedChange().operations,
    app: {
      ...reply.app,
      ui: {
        ...reply.app.ui,
        elements: reply.app.ui.elements.map((element) => {
          if (element.id === "table") {
            return createTable([
              ...createColumns(),
              { property: "dateFinished", label: "Finished" },
            ]);
          }

          return element.id === "editForm" ? createEditForm(fields) : element;
        }),
      },
    },
  };
}

function createColumns(): Entry[] {
  return [
    { property: "title", label: "Title" },
    { property: "author", label: "Author" },
    { property: "status", label: "Status" },
    { property: "rating", label: "Rating" },
  ];
}

function createFields(): Entry[] {
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
function createTable(columns: Entry[]): Entry {
  return {
    id: "table",
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

function createEditForm(fields: Entry[]): Entry {
  return {
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
          input: inputFrom(fields),
        },
        { do: "set", state: "selected", to: null },
        { do: "set", state: "editing", to: null },
      ],
    },
  };
}

/** A form submits one field per entry of its `fields`; this passes each to the action under the same name. */
function inputFrom(fields: Entry[]): Entry[] {
  return fields.map(({ name }) => {
    return { field: name, value: { $event: name } };
  });
}
