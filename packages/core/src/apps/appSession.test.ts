import { firstValueFrom, lastValueFrom, toArray } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

import {
  App,
  type AppDraft,
  applyChangeSet,
  ChangeSet,
  Ontology,
} from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
  createDateFinishedApp,
  createDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

import { collect } from "#/ports/__contracts__/emissions.ts";
import type { ActionResult, StoredObject } from "#/ports/objectStorePort.ts";
import { createCoreHarness } from "#/testing/coreHarness.ts";

import type { AppSession } from "./appSession.ts";

describe("the app session", () => {
  it("submitting addForm with a title adds exactly one book to the table's view", async () => {
    const session = openBookApp();
    const rows = collect(session.rows("books"));

    await rows.next();
    await session.emit("addForm", "submit", { title: "Dune" });
    await rows.next();

    expect(rows.emissions).toEqual([
      [],
      [{ id: expect.any(String), values: { title: "Dune", status: "want" } }],
    ]);
    rows.stop();
  });

  it("submitting addForm without a title writes nothing and puts the problem on the form", async () => {
    const app = createBookApp();

    elementOf(app, "addForm").on?.submit?.push({
      do: "set",
      state: "selected",
      to: "after the invoke",
    });

    const session = openBookApp({ app });

    await session.emit("addForm", "submit", { author: "Nobody" });

    expect(await firstValueFrom(session.problems("addForm"))).toMatchObject([
      { path: "title" },
    ]);
    expect(await firstValueFrom(session.rows("books"))).toEqual([]);
    expect(await firstValueFrom(session.state())).toMatchObject({
      selected: null,
    });
  });

  it("choosing a status filters the table, and the empty choice shows every book", async () => {
    const session = openBookApp({ objects: createShelf() });

    await session.emit("statusFilter", "change", { value: "done" });

    expect(titlesOf(await firstValueFrom(session.rows("books")))).toEqual([
      "Dune",
    ]);

    await session.emit("statusFilter", "change", { value: null });

    expect(titlesOf(await firstValueFrom(session.rows("books")))).toEqual([
      "Dune",
      "Emma",
    ]);
  });

  it("selecting a row and saving editForm updates that book", async () => {
    const session = openBookApp({ objects: createShelf() });
    const [dune] = await firstValueFrom(session.rows("books"));

    await session.emit("table", "select", {
      id: "dune",
      values: dune?.values ?? null,
    });

    expect(await firstValueFrom(session.state())).toMatchObject({
      selected: "dune",
      editing: { title: "Dune", rating: 4 },
    });

    await session.emit("editForm", "submit", { rating: 5 });

    expect(await firstValueFrom(session.rows("books"))).toContainEqual({
      id: "dune",
      values: {
        title: "Dune",
        author: "Frank Herbert",
        status: "done",
        rating: 5,
      },
    });
    expect(await firstValueFrom(session.state())).toMatchObject({
      selected: null,
      editing: null,
    });
  });

  it("a book written before dateFinished shows no date", async () => {
    const session = openBookApp({
      app: createDateFinishedApp(),
      ontology: createDateFinishedOntology(),
      objects: createShelf(),
    });

    await session.emit("table", "select", { id: "dune", values: null });
    await session.emit("editForm", "submit", { rating: 5 });

    expect(await firstValueFrom(session.rows("books"))).toEqual([
      {
        id: "dune",
        values: {
          title: "Dune",
          author: "Frank Herbert",
          status: "done",
          rating: 5,
        },
      },
      { id: "emma", values: { title: "Emma", status: "want" } },
    ]);
  });

  it("a property an object lacks reads as its default, and a deprecated one is left out", async () => {
    const session = openBookApp({
      app: createAppWithoutRating(),
      ontology: createOntologyWithRatingDeprecated(),
      objects: [
        {
          id: "old",
          type: "Book",
          typeVersion: 1,
          values: { title: "Old", rating: 2 },
        },
      ],
    });

    expect(await firstValueFrom(session.rows("books"))).toEqual([
      { id: "old", values: { title: "Old", status: "want" } },
    ]);
  });

  it("the state starts at each key's initial value, and a set changes it at once", async () => {
    const session = openBookApp();
    const states = collect(session.state());

    await states.next();
    await session.emit("statusFilter", "change", { value: "reading" });

    expect(states.emissions).toEqual([
      { status: null, selected: null, editing: null },
      { status: "reading", selected: null, editing: null },
    ]);
    states.stop();
  });

  it("a field the event does not carry sets its state key to null", async () => {
    const session = openBookApp();

    await session.emit("statusFilter", "change", { value: "done" });
    await session.emit("statusFilter", "change", {});

    expect(await firstValueFrom(session.state())).toMatchObject({
      status: null,
    });
  });

  it("a problem is cleared by the element's next event", async () => {
    const session = openBookApp();
    const problems = collect(session.problems("addForm"));

    await problems.next();
    await session.emit("addForm", "submit", {});
    await problems.next();
    await session.emit("addForm", "submit", { title: "Dune" });
    await problems.next();

    expect(problems.emissions).toMatchObject([[], [{ path: "title" }], []]);
    problems.stop();
  });

  it("saving editForm with no row selected writes nothing and says why", async () => {
    const session = openBookApp({ objects: createShelf() });

    await session.emit("editForm", "submit", { rating: 5 });

    expect(await firstValueFrom(session.problems("editForm"))).toMatchObject([
      { path: "target" },
    ]);
    expect(await firstValueFrom(session.rows("books"))).toContainEqual({
      id: "dune",
      values: {
        title: "Dune",
        author: "Frank Herbert",
        status: "done",
        rating: 4,
      },
    });
  });

  it("an event waits for the one before it to finish", async () => {
    const session = openBookApp({ objects: createShelf() });

    await session.emit("table", "select", { id: "dune", values: null });

    const saving = session.emit("editForm", "submit", { rating: 5 });
    const selecting = session.emit("table", "select", {
      id: "emma",
      values: null,
    });

    await Promise.all([saving, selecting]);

    expect(await firstValueFrom(session.state())).toMatchObject({
      selected: "emma",
    });
  });

  it("an event whose store fails rejects, and the next event still runs", async () => {
    const { core, deps } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
    });
    const session = core.openApp(App.parse({ ...createBookApp(), version: 1 }));

    vi.spyOn(deps.objects, "execute").mockRejectedValueOnce(
      new Error("the store is offline"),
    );

    await expect(
      session.emit("addForm", "submit", { title: "Dune" }),
    ).rejects.toThrow("the store is offline");
    await session.emit("addForm", "submit", { title: "Emma" });

    expect(titlesOf(await firstValueFrom(session.rows("books")))).toEqual([
      "Emma",
    ]);
  });

  it("a change of state the view does not read makes no new read", async () => {
    const session = openBookApp();
    const rows = collect(session.rows("books"));

    await rows.next();
    await session.emit("table", "select", { id: "dune", values: null });
    await session.emit("addForm", "submit", { title: "Dune" });
    await rows.next();

    expect(rows.emissions).toEqual([
      [],
      [{ id: expect.any(String), values: { title: "Dune", status: "want" } }],
    ]);
    rows.stop();
  });

  it("an event the element has no handler for changes nothing", async () => {
    const session = openBookApp();

    await session.emit("page", "click", {});

    expect(await firstValueFrom(session.state())).toEqual({
      status: null,
      selected: null,
      editing: null,
    });
  });

  it("an element or a view the app does not declare is refused, inherited names too", async () => {
    const session = openBookApp();

    await expect(session.emit("toString", "click", {})).rejects.toThrow(
      'the app has no element "toString"',
    );
    await expect(firstValueFrom(session.rows("toString"))).rejects.toThrow(
      'the app has no view "toString"',
    );
  });

  it("closing the session ends its streams", async () => {
    const session = openBookApp();
    const states = lastValueFrom(session.state().pipe(toArray()));
    const rows = lastValueFrom(session.rows("books").pipe(toArray()));
    const problems = lastValueFrom(session.problems("addForm").pipe(toArray()));

    session.close();

    expect(await states).toHaveLength(1);
    expect(await rows).toEqual([[]]);
    expect(await problems).toEqual([[]]);
    await expect(
      session.emit("addForm", "submit", { title: "Dune" }),
    ).rejects.toThrow("the app session is closed");
  });

  it("closing the session stops the events still queued, and the handlers after the one under way", async () => {
    const app = createBookApp();
    const submit = elementOf(app, "addForm").on?.submit ?? [];

    submit.push(...submit);

    const { core, deps } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
    });
    const session = core.openApp(App.parse({ ...app, version: 1 }));
    const execute = vi.spyOn(deps.objects, "execute");
    const called = createDeferred<undefined>();
    const stored = createDeferred<ActionResult>();

    execute.mockImplementationOnce(() => {
      called.resolve(undefined);

      return stored.promise;
    });

    const adding = session.emit("addForm", "submit", { title: "Dune" });
    const queued = session.emit("addForm", "submit", { title: "Emma" });

    await called.promise;
    session.close();
    stored.resolve({ kind: "done", id: "object-1" });

    await adding;
    await expect(queued).rejects.toThrow("the app session is closed");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("an object of a type the ontology does not have shows its values as stored", async () => {
    const { core } = createCoreHarness({ objects: createShelf() });
    const session = core.openApp(App.parse({ ...createBookApp(), version: 1 }));

    expect(await firstValueFrom(session.rows("books"))).toContainEqual({
      id: "emma",
      values: { title: "Emma", status: "want" },
    });
  });
});

type AppInput = z.input<typeof AppDraft>;
type OntologyInput = z.input<typeof Ontology>;
type ElementInput = AppInput["ui"]["elements"][string];

interface SessionOptions {
  app?: AppInput;
  ontology?: Ontology;
  objects?: readonly StoredObject[];
}

/** The book tracker opened on a core whose ontology it was built against, at version 1 unless the options say otherwise. */
function openBookApp(options: SessionOptions = {}): AppSession {
  const { core } = createCoreHarness({
    ontology: options.ontology ?? Ontology.parse(createBookOntology()),
    objects: options.objects ?? [],
  });

  return core.openApp(
    App.parse({ ...(options.app ?? createBookApp()), version: 1 }),
  );
}

/** Two books written at `Book@1`: Dune, done and rated 4, and Emma, wanted. */
function createShelf(): StoredObject[] {
  return [
    {
      id: "dune",
      type: "Book",
      typeVersion: 1,
      values: {
        title: "Dune",
        author: "Frank Herbert",
        status: "done",
        rating: 4,
      },
    },
    {
      id: "emma",
      type: "Book",
      typeVersion: 1,
      values: { title: "Emma", status: "want" },
    },
  ];
}

function createDateFinishedOntology(): Ontology {
  const applied = applyChangeSet(
    Ontology.parse(createBookOntology()),
    ChangeSet.parse(createDateFinishedChange()),
  );

  if (applied.kind !== "applied") {
    throw new Error(`the date-finished change did not apply: ${applied.kind}`);
  }

  return applied.ontology;
}

/** The book tracker's ontology with `rating` deprecated, and actions that no longer set it. */
function createOntologyWithRatingDeprecated(): Ontology {
  const ontology: OntologyInput = createBookOntology();
  const fields = ["title", "author", "status"];

  return Ontology.parse({
    ...ontology,
    objectTypes: ontology.objectTypes.map((type) => {
      return {
        ...type,
        properties: type.properties.map((property) => {
          return property.name === "rating"
            ? { ...property, deprecated: true }
            : property;
        }),
      };
    }),
    actionTypes: (ontology.actionTypes ?? []).map((action) => {
      return { ...action, fields, rules: [] };
    }),
  });
}

function createAppWithoutRating(): AppInput {
  const app = createBookApp();

  for (const id of ["addForm", "editForm"]) {
    for (const handler of elementOf(app, id).on?.submit ?? []) {
      if (handler.do === "invoke") {
        delete handler.input?.rating;
      }
    }
  }

  return app;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

/** A promise, and the way to settle it from the test. */
function createDeferred<T>(): Deferred<T> {
  const settlers: ((value: T) => void)[] = [];
  const promise = new Promise<T>((settle) => {
    settlers.push(settle);
  });

  return {
    promise,
    resolve: (value: T): void => {
      for (const settle of settlers) {
        settle(value);
      }
    },
  };
}

function elementOf(app: AppInput, id: string): ElementInput {
  const element = app.ui.elements[id];

  if (element === undefined) {
    throw new Error(`the book tracker has no element "${id}"`);
  }

  return element;
}

interface Titled {
  values: Readonly<Record<string, unknown>>;
}

function titlesOf(rows: readonly Titled[]): unknown[] {
  return rows.map((row) => {
    return row.values.title;
  });
}
