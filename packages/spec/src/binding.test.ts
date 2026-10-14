import { describe, expect, it } from "vitest";

import { App, AppDraft } from "./binding.ts";
import { createBookApp } from "./testing/bookTracker.ts";
import { elementOf, issuesOf } from "./testing/issues.ts";

describe("an app", () => {
  it("is accepted as a draft with no version, and saved only with one", () => {
    const draft = createBookApp();

    expect(issuesOf(AppDraft, draft)).toEqual([]);
    expect(issuesOf(AppDraft, { ...draft, version: 1 })).not.toEqual([]);
    expect(issuesOf(App, draft)).not.toEqual([]);
    expect(App.parse({ ...draft, version: 2 }).version).toBe(2);
  });

  it("binds a type only at a version", () => {
    const app = createBookApp();

    app.bindings.types = [{ type: "Book" } as never];

    expect(issuesOf(AppDraft, app)).not.toEqual([]);
  });

  it("binds each type and each action once", () => {
    const app = createBookApp();

    app.bindings.types.push({ type: "Book", version: 2 });
    app.bindings.actions = [
      { action: "createBook", version: 1 },
      { action: "updateBook", version: 1 },
      { action: "createBook", version: 2 },
    ];

    expect(issuesOf(AppDraft, app)).toEqual([
      '"Book" is bound twice; an app binds one version of a type',
      '"createBook" is bound twice; an app binds one version of an action',
    ]);
  });

  it("reads and invokes only what it binds", () => {
    const app = createBookApp();

    app.ui.views = { ...app.ui.views, authors: { type: "Author" } };
    elementOf(app, "addForm").on = {
      submit: [{ do: "invoke", action: "deleteBook" }],
    };

    expect(issuesOf(AppDraft, app)).toEqual([
      'the view "authors" reads "Author", which the app does not bind',
      '"addForm" invokes "deleteBook", which the app does not bind',
    ]);
  });
});
