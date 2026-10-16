import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { AppDraft, Ontology, type Problem } from "@origamic/spec";
import {
  createBookApp,
  createBookOntology,
} from "@origamic/spec/testing/bookTracker.ts";

import { createCoreHarness } from "./testing/coreHarness.ts";

describe("createCore", () => {
  it("an owner with nothing yet has an empty ontology, no apps and no workspaces", async () => {
    const { core } = createCoreHarness();

    expect(await firstValueFrom(core.ontology())).toMatchObject({
      version: 0,
      objectTypes: [],
    });
    expect(await firstValueFrom(core.apps())).toEqual([]);
    expect(await firstValueFrom(core.workspaces())).toEqual([]);
  });

  it("an app the ontology and the catalog accept is saved at version 1", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
    });

    const saved = await core.saveApp(createBookApp());

    expect(saved).toEqual({
      kind: "saved",
      app: { ...AppDraft.parse(createBookApp()), version: 1 },
    });
    expect(await firstValueFrom(core.apps())).toEqual([
      { id: "books", name: "Books I'm reading", latest: 1 },
    ]);
  });

  it("an app that binds what the ontology does not have is refused, and nothing is saved", async () => {
    const { core } = createCoreHarness();

    const saved = await core.saveApp(createBookApp());

    expect(saved).toMatchObject({
      kind: "invalid",
      problems: expect.arrayContaining([
        expect.objectContaining({ path: "bindings.types.0" }),
      ]),
    });
    expect(await firstValueFrom(core.apps())).toEqual([]);
  });

  it("an app the catalog refuses is not saved", async () => {
    const { core } = createCoreHarness({
      ontology: Ontology.parse(createBookOntology()),
      catalog: {
        manifest: createCoreHarness().deps.catalog.manifest,
        checkElement: (id: string): Problem[] => {
          return id === "table"
            ? [
                {
                  path: "ui.elements.table.props.columns",
                  message: "no columns",
                },
              ]
            : [];
        },
      },
    });

    const saved = await core.saveApp(createBookApp());

    expect(saved).toEqual({
      kind: "invalid",
      problems: [
        { path: "ui.elements.table.props.columns", message: "no columns" },
      ],
    });
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
