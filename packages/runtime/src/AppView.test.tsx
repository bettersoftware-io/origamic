import { describe, expect, it } from "vitest";

import type { AppSession, StoredObject } from "@origamic/core";
import { createCoreHarness } from "@origamic/core/testing/coreHarness.ts";
import { App, AppDraft, Ontology } from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
} from "@origamic/spec/testing/bookTracker.ts";

import { mountAppView } from "./AppView.page.tsx";

describe("the app view", () => {
  it("the saved spec renders a table with the two books", async () => {
    const page = mountAppView(await openSavedBookApp());

    await page.submitForm("addForm", { title: "Emma" });
    await page.submitForm("addForm", { title: "Dune", status: "done" });

    expect(await page.bookTitles()).toEqual(["Dune", "Emma"]);
  });

  it('choosing "done" in the filter leaves the done books', async () => {
    const page = mountAppView(openBookApp({ objects: createShelf() }));

    expect(await page.bookTitles()).toEqual(["Dune", "Emma"]);

    await page.choose("statusFilter", "done");

    expect(await page.bookTitles()).toEqual(["Dune"]);

    await page.choose("statusFilter", "Every status");

    expect(await page.bookTitles()).toEqual(["Dune", "Emma"]);
  });

  it("an equal App built afresh keeps the app's state, and another version starts from its own", async () => {
    const { app, session } = openBookApp({ objects: createShelf() });
    const page = mountAppView({ app, session });

    await page.choose("statusFilter", "done");
    await page.fillForm("addForm", { title: "Middlemarch" });
    await page.show(App.parse({ ...createBookApp(), version: 1 }), session);

    expect(await page.bookTitles()).toEqual(["Dune"]);
    expect(page.shownIn("addForm", "title")).toBe("Middlemarch");

    const next = openBookApp({ objects: createShelf(), version: 2 });

    await page.show(next.app, next.session);

    expect(await page.bookTitles()).toEqual(["Dune", "Emma"]);
  });

  it("the title problem shows under the form's field", async () => {
    const page = mountAppView(openBookApp());

    await page.submitForm("addForm", { author: "Nobody" });

    expect(page.problemsBeside("addForm", "title")).toEqual([
      '"title" is required',
    ]);
    expect(page.shownIn("addForm", "author")).toBe("Nobody");
    expect(await page.bookTitles()).toEqual([]);
  });

  it("an element whose component is unknown shows the box with its name", async () => {
    const input = createBookApp();

    input.ui.elements.statusFilter = { component: "Chart" };

    const page = mountAppView(openBookApp({ app: input }));

    expect(page.alert("statusFilter")).toBe('Unknown component "Chart"');
    expect(await page.bookTitles()).toEqual([]);
  });

  it("a child the spec does not hold shows the box with its id", () => {
    const { app, session } = openBookApp();

    elementOf(app, "page").children.push("chart");

    const page = mountAppView({ app, session });

    expect(page.alert("chart")).toBe('No element "chart"');
  });

  it("the add form starts empty again once its book is added", async () => {
    const page = mountAppView(openBookApp());

    await page.submitForm("addForm", { title: "Dune", author: "Herbert" });

    expect(await page.bookTitles()).toEqual(["Dune"]);
    expect(page.shownIn("addForm", "title")).toBe("");
    expect(page.shownIn("addForm", "author")).toBe("");
  });

  it("selecting a row fills the edit form, and saving it updates that book", async () => {
    const page = mountAppView(openBookApp({ objects: createShelf() }));

    await page.selectRow("table", "emma");

    expect(page.selectedRows("table")).toEqual(["emma"]);
    expect(page.shownIn("editForm", "title")).toBe("Emma");

    await page.submitForm("editForm", { rating: "5" });

    expect(page.cellsOf("table", "emma")).toEqual(["Emma", "", "want", "5"]);
    expect(page.selectedRows("table")).toEqual([]);
    expect(page.notice("editForm")).toBe("Select a row to edit");
  });

  it("a view the app cannot read is shown in its place, not a blank panel", () => {
    const { app, session } = openBookApp();

    app.ui.elements.table = {
      ...elementOf(app, "table"),
      props: { rows: { $view: "shelf" } },
    };

    const page = mountAppView({ app, session });

    expect(page.alert("page")).toBe(
      'The app could not be shown: the app has no view "shelf"',
    );
  });

  it("an event the session refuses says why on its element", async () => {
    const opened = openBookApp();
    const page = mountAppView(opened);

    opened.session.close();
    await page.submitForm("addForm", { title: "Dune" });

    expect(page.problemsOf("addForm")).toEqual(["the app session is closed"]);
    expect(page.shownIn("addForm", "title")).toBe("Dune");
  });
});

interface Opened {
  app: App;
  session: AppSession;
}

interface OpenOptions {
  app?: ReturnType<typeof createBookApp>;
  objects?: readonly StoredObject[];
  version?: number;
}

/** The book tracker as slice step 5 has it: saved to the library, then opened. */
async function openSavedBookApp(): Promise<Opened> {
  const { core } = createCoreHarness({
    ontology: Ontology.parse(createBookOntology()),
  });
  const app = await core.library.saveApp(AppDraft.parse(createBookApp()));

  return { app, session: core.openApp(app) };
}

function openBookApp({
  app = createBookApp(),
  objects = [],
  version = 1,
}: OpenOptions = {}): Opened {
  const { core } = createCoreHarness({
    ontology: Ontology.parse(createBookOntology()),
    objects,
  });
  const parsed = App.parse({ ...app, version });

  return { app: parsed, session: core.openApp(parsed) };
}

/** An element of a parsed app, for a test to break it in a way the schemas would refuse. */
function elementOf(app: App, id: string): App["ui"]["elements"][string] {
  const element = app.ui.elements[id];

  if (element === undefined) {
    throw new Error(`the book tracker has no element "${id}"`);
  }

  return element;
}

/** Two books written at `Book@1`: Dune, done, and Emma, wanted. */
function createShelf(): StoredObject[] {
  return [
    {
      id: "emma",
      type: "Book",
      typeVersion: 1,
      values: { title: "Emma", status: "want" },
    },
    {
      id: "dune",
      type: "Book",
      typeVersion: 1,
      values: { title: "Dune", author: "Frank Herbert", status: "done" },
    },
  ];
}
