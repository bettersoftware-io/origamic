import { z } from "zod";

import { Id, Json, type JsonValue, type PropKind } from "@origamic/spec";

/**
 * One prop of a component's contract: what it accepts, by kind, and the
 * schema of the value it holds (ADR-0002). A `fixed` prop holds a value, a
 * `state` prop a value or a `$state`, a `view` prop a `$view` and nothing
 * else. A prop is required unless its contract says `.optional()`.
 */
export interface PropContract<
  K extends PropKind,
  T extends z.ZodType,
  R extends boolean = true,
> {
  readonly kind: K;
  readonly schema: T;
  readonly required: R;
  /** The same prop, which an element may leave out. */
  optional: () => PropContract<K, T, false>;
}

/** A prop of any kind, required or not: what a contract's props are made of. */
export type AnyProp = PropContract<PropKind, z.ZodType, boolean>;

/** One row of a view, as a `view` prop receives it. It is spec's `Row` once part 3 adds that to `packages/spec`. */
export interface Row {
  readonly id: string;
  readonly values: Readonly<Record<string, JsonValue>>;
}

/** What a `view` prop receives: the rows of its view, in the view's order. */
const RowsSchema = z.array(
  z.strictObject({ id: Id, values: z.record(z.string(), Json) }),
);

/** A prop that holds a value its schema accepts, written in the spec. */
export function fixed<T extends z.ZodType>(
  schema: T,
): PropContract<"fixed", T> {
  return propOf("fixed", schema, true);
}

/** A prop that holds a value its schema accepts, or reads one the app keeps: `{"$state": "<key>"}`. */
export function state<T extends z.ZodType>(
  schema: T,
): PropContract<"state", T> {
  return propOf("state", schema, true);
}

/** A prop that reads the rows of a view, `{"$view": "<view id>"}`, and nothing else. */
export function view(): PropContract<"view", typeof RowsSchema> {
  return propOf("view", RowsSchema, true);
}

function propOf<K extends PropKind, T extends z.ZodType, R extends boolean>(
  kind: K,
  schema: T,
  required: R,
): PropContract<K, T, R> {
  return {
    kind,
    schema,
    required,
    optional: (): PropContract<K, T, false> => {
      return propOf(kind, schema, false);
    },
  };
}
