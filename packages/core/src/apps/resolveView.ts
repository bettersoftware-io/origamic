import type { JsonValue, View } from "@origamic/spec";

import type { ViewFilter, ViewQuery } from "#/ports/objectStorePort.ts";

/** What an open app keeps between events, by state key. */
export type StateValues = Readonly<Record<string, JsonValue>>;

/**
 * The query a view makes in the state it is read in. A filter whose value
 * reads a state key that holds `null` is left out: that is how "every
 * status" is said (ADR-0002). A state key the state does not hold reads as
 * `null`. A literal value, `null` too, is kept as it is.
 */
export function resolveView(view: View, state: StateValues): ViewQuery {
  const filter: ViewFilter[] = [];

  for (const { property, op, value } of view.filter) {
    if (!isStateRef(value)) {
      filter.push({ property, op, value });
      continue;
    }

    const held = stateValue(state, value.$state);

    if (held !== null) {
      filter.push({ property, op, value: held });
    }
  }

  const query: ViewQuery = { type: view.type, filter, sort: [...view.sort] };

  return view.limit === undefined ? query : { ...query, limit: view.limit };
}

interface StateRef {
  $state: string;
}

/** The value of a state key, by its own name only: a key every object inherits is not one. */
export function stateValue(state: StateValues, key: string): JsonValue {
  return Object.hasOwn(state, key) ? (state[key] ?? null) : null;
}

/** A filter's value that reads a state key. A literal never has a `$` key: the spec refuses one. */
function isStateRef(value: JsonValue | StateRef): value is StateRef {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.hasOwn(value, "$state")
  );
}
