import { describe, expect, it } from "vitest";

import { type JsonValue, Ontology } from "@origamic/spec";

import { type Property, valueSchema } from "./valueSchema.ts";

describe("valueSchema", () => {
  it.each<[Property["type"], JsonValue, JsonValue]>([
    ["string", "Dune", 7],
    ["text", "A long review.", false],
    ["number", 4.5, "4.5"],
    ["integer", 4, 4.5],
    ["boolean", true, "yes"],
    ["date", "2026-10-16", "16/10/2026"],
    ["datetime", "2026-10-16T09:30:00Z", "2026-10-16"],
    ["enum", "done", "maybe"],
  ])("a %s property takes %j and refuses %j", (type, good, bad) => {
    const schema = valueSchema(createProperty(type));

    expect(schema.safeParse(good).success).toBe(true);
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("a number property refuses a value JSON cannot hold", () => {
    const schema = valueSchema(createProperty("number"));

    expect(schema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
  });

  it.each<[Property["type"], string]>([
    ["string", '"value" is text'],
    ["text", '"value" is text'],
    ["number", '"value" is a number'],
    ["integer", '"value" is a whole number'],
    ["boolean", '"value" is true or false'],
    ["date", '"value" is a date, as 2026-10-16'],
    ["datetime", '"value" is a date and time, as 2026-10-16T09:30:00Z'],
    ["enum", '"value" is one of want, reading, done'],
  ])(
    "a %s property words its refusal for the person who fixes it",
    (type, message) => {
      const result = valueSchema(createProperty(type)).safeParse(null);

      expect(
        result.error?.issues.map((issue) => {
          return issue.message;
        }),
      ).toEqual([message]);
    },
  );
});

/** A property of each type, as the ontology's schema reads it. */
function createProperty(type: Property["type"]): Property {
  const ontology = Ontology.parse({
    format: 1,
    version: 1,
    objectTypes: [
      {
        name: "Thing",
        version: 1,
        titleProperty: "value",
        properties: [
          type === "enum"
            ? { name: "value", type, values: ["want", "reading", "done"] }
            : { name: "value", type },
        ],
      },
    ],
  });
  const property = ontology.objectTypes[0]?.properties[0];

  if (property === undefined) {
    throw new Error("the fixture ontology has no property");
  }

  return property;
}
