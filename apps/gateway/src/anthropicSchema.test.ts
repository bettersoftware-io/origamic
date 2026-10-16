import { describe, expect, it } from "vitest";

import { generationSchema, type JsonSchema } from "@origamic/catalog/manifest";

import { anthropicSchemaOf } from "./anthropicSchema.ts";

describe("the schema Anthropic's structured outputs are sent", () => {
  it("leaves out the limits the API does not hold the model to, and tells the model them in the description", () => {
    const sent = anthropicSchemaOf({
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "A name.",
          minLength: 1,
          maxLength: 40,
          pattern: "^[a-z]+$",
        },
        rating: { type: "integer", minimum: 1, maximum: 5, default: 3 },
        size: { type: "number", exclusiveMinimum: 0 },
      },
      required: ["name"],
      additionalProperties: false,
    });

    expect(sent).toEqual({
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            'A name.\n\n{minLength: 1, maxLength: 40, pattern: "^[a-z]+$"}',
        },
        rating: {
          type: "integer",
          description: "{minimum: 1, maximum: 5, default: 3}",
        },
        size: { type: "number", description: "{exclusiveMinimum: 0}" },
      },
      required: ["name"],
      additionalProperties: false,
    });
  });

  it("keeps what the API holds the model to", () => {
    const schema: JsonSchema = {
      $defs: { Ref: { type: "string", enum: ["a", "b"] } },
      type: "object",
      title: "Reply",
      properties: {
        kind: { type: "string", const: "x" },
        when: { type: "string", format: "date" },
        tags: { type: "array", items: { $ref: "#/$defs/Ref" }, minItems: 1 },
        either: { anyOf: [{ type: "string" }, { type: "null" }] },
        both: {
          allOf: [
            { type: "object", properties: {}, additionalProperties: false },
          ],
        },
      },
      required: ["kind"],
      additionalProperties: false,
    };

    expect(anthropicSchemaOf(schema)).toEqual(schema);
  });

  it("writes a type given as a list as an anyOf of one type each", () => {
    expect(
      anthropicSchemaOf({ type: ["string", "null"], description: "Or none." }),
    ).toEqual({
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Or none.",
    });
  });

  it("keeps a list of types beside an anyOf the node already has", () => {
    expect(
      anthropicSchemaOf({
        type: ["string", "null"],
        anyOf: [{ const: "a" }, { const: null }],
      }),
    ).toEqual({
      allOf: [
        { anyOf: [{ type: "string" }, { type: "null" }] },
        { anyOf: [{ const: "a" }, { const: null }] },
      ],
    });
  });

  it("keeps a format the API knows, a minItems of 0 or 1, and tells the model the others", () => {
    expect(
      anthropicSchemaOf({
        type: "object",
        properties: {
          site: { type: "string", format: "uri" },
          colour: { type: "string", format: "color" },
          none: { type: "array", items: { type: "string" }, minItems: 0 },
          pair: { type: "array", items: { type: "string" }, minItems: 2 },
        },
        additionalProperties: false,
      }),
    ).toEqual({
      type: "object",
      properties: {
        site: { type: "string", format: "uri" },
        colour: { type: "string", description: '{format: "color"}' },
        none: { type: "array", items: { type: "string" }, minItems: 0 },
        pair: {
          type: "array",
          items: { type: "string" },
          description: "{minItems: 2}",
        },
      },
      additionalProperties: false,
    });
  });

  it("reads a property named like a keyword as a property, not as the keyword", () => {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        format: { const: 1 },
        pattern: { type: "string" },
        default: { type: "boolean" },
      },
      additionalProperties: false,
    };

    expect(anthropicSchemaOf(schema)).toEqual(schema);
  });

  it("leaves no keyword in the catalog's schema that the API does not hold, and does not change what it is given", () => {
    const schema = generationSchema();
    const before = JSON.stringify(schema);

    const sent = anthropicSchemaOf(schema);

    expect(
      keywordsIn(sent).filter((keyword) => {
        return !KEPT.has(keyword);
      }),
    ).toEqual([]);
    expect(JSON.stringify(sent)).not.toMatch(/"type":\[/);
    expect(JSON.stringify(schema)).toBe(before);
  });
});

const KEPT = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "anyOf",
  "allOf",
  "$ref",
  "$defs",
  "description",
  "title",
  "format",
  "minItems",
]);

/** Every keyword of every schema node, reading `properties` and `$defs` as maps of names. */
function keywordsIn(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap(keywordsIn);
  }

  if (typeof node !== "object" || node === null) {
    return [];
  }

  return Object.entries(node).flatMap(([key, value]) => {
    const inner =
      key === "properties" || key === "$defs"
        ? Object.values(value ?? {}).flatMap(keywordsIn)
        : keywordsIn(value);

    return [key, ...inner];
  });
}
