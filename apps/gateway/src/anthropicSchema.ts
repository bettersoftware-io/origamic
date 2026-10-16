import type { JsonSchema } from "@origamic/catalog/manifest";

/** A JSON Schema as Anthropic's structured outputs take it: `output_config.format.schema`. */
export type AnthropicSchema = Record<string, unknown>;

/**
 * The catalog's schema as Anthropic's structured outputs hold a model to it
 * (ADR-0011). The API holds types, `enum`, `const`, `anyOf`, `allOf`,
 * `$ref` and `$defs`, closed objects, ten string formats and a `minItems`
 * of 0 or 1; it does not hold a length, a bound, a pattern or a default.
 * Those are left out of what is sent and written into the node's
 * description instead, so the model still reads them; `readGenerated`
 * checks every one of them on the reply. A type given as a list becomes an
 * `anyOf` of one type each.
 *
 * Not the SDK's `transformJSONSchema`: that one also moves `const` and
 * `enum` into the description, which would free the `component` and `do`
 * that tell the catalog's elements and handlers apart.
 *
 * Pure: the schema it is given is not changed.
 */
export function anthropicSchemaOf(schema: JsonSchema): AnthropicSchema {
  return nodeOf(schema);
}

/** Kept as they are. */
const HELD = new Set([
  "required",
  "additionalProperties",
  "enum",
  "const",
  "$ref",
  "description",
  "title",
]);

/** The string formats the API holds a model to. */
const FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

function nodeOf(node: object): AnthropicSchema {
  const sent: AnthropicSchema = {};
  const told: string[] = [];
  let types: unknown[] | undefined;
  let anyOf: unknown[] | undefined;
  let allOf: unknown[] = [];

  for (const [key, value] of entriesOf(node)) {
    if (key === "properties" || key === "$defs") {
      sent[key] = mapOf(value);
    } else if (key === "anyOf") {
      anyOf = listOf(value);
    } else if (key === "allOf") {
      allOf = listOf(value);
    } else if (
      key === "items" ||
      (key === "additionalProperties" && isNode(value))
    ) {
      sent[key] = isNode(value) ? nodeOf(value) : value;
    } else if (key === "type") {
      if (Array.isArray(value)) {
        types = value;
      } else {
        sent[key] = value;
      }
    } else if (isHeld(key, value)) {
      sent[key] = value;
    } else if (key !== "$schema") {
      told.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  const typesAnyOf = types?.map((type) => {
    return { type };
  });

  if (typesAnyOf !== undefined && anyOf !== undefined) {
    allOf = [...allOf, { anyOf: typesAnyOf }, { anyOf }];
  } else if (typesAnyOf !== undefined || anyOf !== undefined) {
    sent.anyOf = typesAnyOf ?? anyOf;
  }

  if (allOf.length > 0) {
    sent.allOf = allOf;
  }

  if (told.length > 0) {
    const limits = `{${told.join(", ")}}`;

    sent.description =
      typeof sent.description === "string"
        ? `${sent.description}\n\n${limits}`
        : limits;
  }

  return sent;
}

function isHeld(key: string, value: unknown): boolean {
  if (key === "format") {
    return typeof value === "string" && FORMATS.has(value);
  }

  if (key === "minItems") {
    return value === 0 || value === 1;
  }

  return HELD.has(key);
}

/** `properties` and `$defs`: a name for each schema, where a name is never a keyword. */
function mapOf(value: unknown): AnthropicSchema {
  return isNode(value)
    ? Object.fromEntries(
        entriesOf(value).map(([name, inner]) => {
          return [name, isNode(inner) ? nodeOf(inner) : inner];
        }),
      )
    : {};
}

function listOf(value: unknown): unknown[] {
  return Array.isArray(value)
    ? value.map((inner: unknown) => {
        return isNode(inner) ? nodeOf(inner) : inner;
      })
    : [];
}

function isNode(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function entriesOf(node: object): [string, unknown][] {
  return Object.keys(node).map((key) => {
    const value: unknown = Reflect.get(node, key);

    return [key, value];
  });
}
