import type { z } from "zod";

import type { AnyProp, PropContract, Row } from "./props.ts";

/** An event whose payload's fields are the `name` of each entry of one of the element's props: a Form submits one field per entry of its `fields`. */
export interface FieldsOf {
  readonly fieldsOf: string;
}

/** What an event's payload carries: fields named here, or fields named by the element's props. */
type EventContract = readonly string[] | FieldsOf;

export type PropContracts = Readonly<Record<string, AnyProp>>;

export type EventContracts = Readonly<Record<string, EventContract>>;

/**
 * A catalog component in Origamic's own terms (ADR-0010): its props by kind,
 * each with the schema of what it holds, the events it emits, and a
 * description for the model. It knows nothing of what implements it.
 */
export interface ComponentContract<
  P extends PropContracts = PropContracts,
  E extends EventContracts = EventContracts,
> {
  readonly name: string;
  readonly description: string;
  readonly props: P;
  readonly events: E;
}

/** What a component receives for each prop: a view's rows, or the value its schema gives. A prop the contract makes optional may be missing. */
export type PropsOf<C extends ComponentContract> = {
  readonly [K in RequiredOf<C["props"]>]: Received<C["props"][K]>;
} & {
  readonly [K in Exclude<keyof C["props"], RequiredOf<C["props"]>>]?: Received<
    C["props"][K]
  >;
};

type RequiredOf<P extends PropContracts> = {
  [K in keyof P]: P[K]["required"] extends true ? K : never;
}[keyof P];

type Received<P> =
  P extends PropContract<"view", z.ZodType, boolean>
    ? readonly Row[]
    : P extends PropContract<"fixed" | "state", infer T, boolean>
      ? z.output<T>
      : never;

/** A contract, as written: the types of its props and events are kept, so a component's props can be read from it. */
export function defineComponent<
  P extends PropContracts,
  E extends EventContracts,
>(contract: ComponentContract<P, E>): ComponentContract<P, E> {
  return contract;
}

/** The payload of an event carries one field per entry of the prop `prop`, named by the entry's `name`. */
export function fieldsOf(prop: string): FieldsOf {
  return { fieldsOf: prop };
}
