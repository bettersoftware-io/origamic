import { AppDraft, ChangeSet, Ontology, WorkspaceDraft } from "@origamic/spec";

// The book tracker, as the contracts need it. The architecture gate counts a
// contract as production code, so a contract may not import the spec's
// testing fixtures; these are the few it needs, kept as small as the
// contracts allow. Each factory returns a fresh copy.

/** The book tracker's ontology at version 1: `Book@1`, `createBook@1` and `updateBook@1`, a rating from 1 to 5. */
export function createBookOntology(): Ontology {
  const fields = ["title", "author", "status", "rating"];
  const rules = [{ kind: "range", property: "rating", min: 1, max: 5 }];

  return Ontology.parse({
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
        fields,
        rules,
      },
      {
        name: "updateBook",
        version: 1,
        kind: "update",
        type: "Book",
        fields,
        rules,
      },
    ],
  });
}

/** Slice step 7, against `createBookOntology`: `Book` gains `dateFinished`, and `updateBook` sets it. */
export function createDateFinishedChange(): ChangeSet {
  return ChangeSet.parse({
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
  });
}

/** An app over `Book@<bookVersion>`, as small as the schema allows: one element, no view. */
export function createAppDraft(
  id: string,
  name: string,
  bookVersion = 1,
): AppDraft {
  return AppDraft.parse({
    format: 1,
    id,
    name,
    ontologyVersion: bookVersion,
    bindings: { types: [{ type: "Book", version: bookVersion }] },
    ui: { root: "page", elements: { page: { component: "Stack" } } },
  });
}

/** The workspace "reading", with the books app in its one panel at `appVersion`. */
export function createWorkspaceDraft(appVersion: number): WorkspaceDraft {
  return WorkspaceDraft.parse({
    format: 1,
    id: "reading",
    name: "Reading",
    panels: { books: { app: "books", appVersion } },
    layout: { kind: "panel", panel: "books" },
  });
}

/**
 * A new UUID (version 4), for an id or an e-mail no earlier run has used, so
 * a store shared between runs can take it. Test data only: `Math.random` is
 * no source for an id that must not be guessed.
 */
export function createId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (place) => {
    const random = Math.floor(Math.random() * 16);

    return (place === "x" ? random : 8 + (random % 4)).toString(16);
  });
}
