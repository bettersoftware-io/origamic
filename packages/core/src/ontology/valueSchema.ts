import { z } from "zod";

import type { JsonValue, ObjectType } from "@origamic/spec";

/** A property of an object type, as the ontology defines it. */
export type Property = ObjectType["properties"][number];

/**
 * The Zod schema of a value of `property`: the ontology's property types are
 * a vocabulary Zod is compiled from (ADR-0006, amended). It judges a value
 * that is there; whether one must be there is the action's rule to say, in
 * `planWrite`. Each refusal names the property, for whoever fixes the input.
 */
export function valueSchema(property: Property): z.ZodType<JsonValue> {
  const name = `"${property.name}"`;

  switch (property.type) {
    case "string":
    case "text":
      return z.string({ error: `${name} is text` });
    case "number":
      return z.number({ error: `${name} is a number` });
    case "integer":
      return z.int({ error: `${name} is a whole number` });
    case "boolean":
      return z.boolean({ error: `${name} is true or false` });
    case "date":
      return z.iso.date({ error: `${name} is a date, as 2026-10-16` });
    case "datetime":
      return z.iso.datetime({
        error: `${name} is a date and time, as 2026-10-16T09:30:00Z`,
      });
    case "enum":
      return z.enum(property.values, {
        error: `${name} is one of ${property.values.join(", ")}`,
      });
  }
}
