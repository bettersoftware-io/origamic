import { describe, expect, it } from "vitest";

import { ChangeSet, Ontology } from "@origamic/spec";
import {
  createBookOntology as createSpecBookOntology,
  createDateFinishedChange as createSpecDateFinishedChange,
} from "@origamic/spec/testing/bookTracker.ts";

import { createBookOntology, createDateFinishedChange } from "./fixtures.ts";

describe("the contracts' copy of the book tracker", () => {
  it("has the book ontology the spec's fixtures have", () => {
    expect(createBookOntology()).toEqual(
      Ontology.parse(createSpecBookOntology()),
    );
  });

  it("has the date-finished change the spec's fixtures have", () => {
    expect(createDateFinishedChange()).toEqual(
      ChangeSet.parse(createSpecDateFinishedChange()),
    );
  });
});
