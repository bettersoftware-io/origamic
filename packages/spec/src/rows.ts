import type { JsonValue } from "./common.ts";

/** One object as a view hands it to a component: its id and its values, by property name. */
export interface Row {
  id: string;
  values: Readonly<Record<string, JsonValue>>;
}
