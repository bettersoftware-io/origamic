import type { ReactNode } from "react";

import type { JsonValue, Problem } from "@origamic/spec";

/**
 * What the runtime hands every catalog component: its props as its contract
 * gives them (a view's rows, a state key's value), the children it shows, how
 * it emits an event, its test id, and the problems the last thing it caused
 * came back with. A component is a pure function of these (ADR-0010).
 */
export interface Envelope<P> {
  props: P;
  children: ReactNode;
  emit: (event: string, payload: Readonly<Record<string, JsonValue>>) => void;
  testId: string;
  problems: readonly Problem[];
}
