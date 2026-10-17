import { GenerationEvent, type JsonValue } from "@origamic/spec";

// What the model answers when there is no gateway: `pnpm dev`, and the
// end-to-end tests. Two replies of the book tracker, in the order the first
// slice asks for them (FIRST-SLICE.md): the app, then the date it was
// finished. The LLM simulator gives one reply to each generation, whatever
// was asked, so a third ask has no reply and says so.

/** The two replies, each checked by spec's schema as a gateway's events are. */
export function createDevScript(): GenerationEvent[][] {
  return [createBookTrackerReply(), createDateFinishedReply()].map((reply) => {
    return reply.map((event) => {
      return GenerationEvent.parse(event);
    });
  });
}

/** Slice steps 2 and 3: the `Book` type with its two actions, and the app over it. */
function createBookTrackerReply(): JsonValue[] {
  return [
    { kind: "progress", message: "Reading your ontology" },
    { kind: "progress", message: "Writing the app" },
    {
      kind: "proposal",
      proposal: {
        explanation:
          "A Book type with a title, an author, a status and a rating, the actions to add and to change one, and an app with a table, a status filter and two forms.",
        changeSet: {
          format: 1,
          baseVersion: 0,
          operations: [
            {
              op: "addObjectType",
              objectType: {
                name: "Book",
                titleProperty: "title",
                properties: [
                  { name: "title", type: "string", required: true },
                  { name: "author", type: "string" },
                  {
                    name: "status",
                    type: "enum",
                    values: STATUSES,
                    required: true,
                    default: "want",
                  },
                  { name: "rating", type: "integer" },
                ],
              },
            },
            {
              op: "addActionType",
              actionType: createBookAction("createBook", "create", FIELDS),
            },
            {
              op: "addActionType",
              actionType: createBookAction("updateBook", "update", FIELDS),
            },
          ],
        },
        app: createBookApp(1),
      },
    },
  ];
}

/** Slice step 7: "add a 'date finished' field", as a change set and a revision of the app. */
function createDateFinishedReply(): JsonValue[] {
  return [
    { kind: "progress", message: "Reading your ontology and the app" },
    { kind: "progress", message: "Revising the app" },
    {
      kind: "proposal",
      proposal: {
        explanation:
          "A date finished on Book, which updateBook can set, shown in the table and in the edit form.",
        changeSet: {
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
              actionType: createBookAction("updateBook", "update", [
                ...FIELDS,
                "dateFinished",
              ]),
            },
          ],
        },
        app: createBookApp(2),
      },
    },
  ];
}

const STATUSES = ["want", "reading", "done"];
const FIELDS = ["title", "author", "status", "rating"];

function createBookAction(
  name: string,
  kind: string,
  fields: string[],
): JsonValue {
  return {
    name,
    kind,
    type: "Book",
    fields,
    rules: [{ kind: "range", property: "rating", min: 1, max: 5 }],
  };
}

/**
 * The book tracker against ontology version `ontologyVersion`: at 1 the
 * first app, at 2 its revision, whose table and edit form take the date a
 * book was finished.
 */
function createBookApp(ontologyVersion: number): JsonValue {
  const revised = ontologyVersion > 1;
  const fields = createFields();
  const editFields = revised
    ? [...fields, { name: "dateFinished", label: "Finished", input: "date" }]
    : fields;
  const editInput = revised ? [...FIELDS, "dateFinished"] : FIELDS;

  return {
    format: 1,
    id: "books",
    name: "Books I'm reading",
    ontologyVersion,
    bindings: {
      types: [{ type: "Book", version: ontologyVersion }],
      actions: [
        { action: "createBook", version: 1 },
        { action: "updateBook", version: ontologyVersion },
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
            options: STATUSES,
            emptyLabel: "Every status",
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
            columns: [
              { property: "title", label: "Title" },
              { property: "author", label: "Author" },
              { property: "status", label: "Status" },
              { property: "rating", label: "Rating" },
              ...(revised
                ? [{ property: "dateFinished", label: "Finished" }]
                : []),
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
        addForm: {
          component: "Form",
          props: { fields, submitLabel: "Add", mode: "create" },
          on: {
            submit: [
              {
                do: "invoke",
                action: "createBook",
                input: inputOf(FIELDS),
              },
            ],
          },
        },
        editForm: {
          component: "Form",
          props: {
            fields: editFields,
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
                input: inputOf(editInput),
              },
              { do: "set", state: "selected", to: null },
              { do: "set", state: "editing", to: null },
            ],
          },
        },
      },
    },
  };
}

function createFields(): JsonValue[] {
  return [
    { name: "title", label: "Title", input: "text" },
    { name: "author", label: "Author", input: "text" },
    { name: "status", label: "Status", input: "select", options: STATUSES },
    { name: "rating", label: "Rating", input: "number" },
  ];
}

/** A form submits each field under its name; an action takes each under the same name. */
function inputOf(names: string[]): JsonValue {
  return Object.fromEntries(
    names.map((name) => {
      return [name, { $event: name }];
    }),
  );
}
