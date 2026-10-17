import { stateValue } from "@origamic/core";
import type { Element, PropKind } from "@origamic/spec";

import { type AppSnapshot, stateKeyOf, viewIdOf } from "./appSnapshot.ts";

/**
 * What a component receives for each prop the element sets, by the prop's
 * kind (ADR-0002): a `view` prop the rows of the view it names, a `state`
 * prop the value of the state key it names or the value it holds, a `fixed`
 * prop the value it holds. A prop the manifest does not give a kind is
 * handed on as written. The component's contract judges what it receives.
 */
export function resolveProps(
  element: Element,
  kinds: Readonly<Record<string, PropKind>>,
  snapshot: AppSnapshot,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(element.props).map(([name, value]) => {
      const kind = Object.hasOwn(kinds, name) ? kinds[name] : undefined;

      return [name, resolved(kind, value, snapshot)];
    }),
  );
}

type PropValue = Element["props"][string];

function resolved(
  kind: PropKind | undefined,
  value: PropValue,
  snapshot: AppSnapshot,
): unknown {
  if (kind === "view") {
    const viewId = viewIdOf(value);

    return viewId !== undefined && Object.hasOwn(snapshot.rows, viewId)
      ? snapshot.rows[viewId]
      : value;
  }

  if (kind === "state") {
    const key = stateKeyOf(value);

    return key === undefined ? value : stateValue(snapshot.state, key);
  }

  return value;
}
