import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { AppDraft, Ontology } from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
} from "@origamic/spec/testing/bookTracker.ts";

import { createCoreHarness } from "./testing/coreHarness.ts";

describe("createCore", () => {
  it("an owner with nothing yet has no apps and no workspaces", async () => {
    const { core } = createCoreHarness();

    expect(await firstValueFrom(core.library.apps())).toEqual([]);
    expect(await firstValueFrom(core.library.workspaces())).toEqual([]);
  });

  it("loading an app built against the current ontology finds it compatible", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
    });

    await core.library.saveApp(AppDraft.parse(createBookApp()));

    expect(await core.loadApp("books", 1)).toEqual({
      app: { ...AppDraft.parse(createBookApp()), version: 1 },
      compatibility: { kind: "compatible" },
    });
  });

  it("loading an app that uses a property the ontology deprecated gives a report, not an error", async () => {
    const { core } = createCoreHarness({
      ontology: createOntologyWithAuthorDeprecated(),
    });

    await core.library.saveApp(AppDraft.parse(createBookApp()));

    expect(await core.loadApp("books", 1)).toMatchObject({
      app: { version: 1 },
      compatibility: {
        kind: "report",
        breaks: expect.arrayContaining([
          { binding: "Book@1", property: "author", reason: "deprecated" },
        ]),
      },
    });
  });

  it("loading a version the library does not have gives null", async () => {
    const { core } = createCoreHarness();

    expect(await core.loadApp("books", 1)).toBeNull();
  });

  it("signing in goes through the session it was given", async () => {
    const { core } = createCoreHarness({
      accounts: [{ email: "reader@example.com", password: "a password" }],
    });

    await core.session.signIn("reader@example.com", "a password");

    expect(await firstValueFrom(core.session.user())).toMatchObject({
      email: "reader@example.com",
    });
  });
});

/** The book tracker's ontology with `author` deprecated, and actions that no longer set it. */
function createOntologyWithAuthorDeprecated(): Ontology {
  const ontology = createBookOntology();

  return Ontology.parse({
    ...ontology,
    objectTypes: ontology.objectTypes.map((type) => {
      return {
        ...type,
        properties: type.properties.map((property) => {
          return property.name === "author"
            ? { ...property, deprecated: true }
            : property;
        }),
      };
    }),
    actionTypes: (ontology.actionTypes ?? []).map((action) => {
      return { ...action, fields: ["title", "status", "rating"] };
    }),
  });
}
