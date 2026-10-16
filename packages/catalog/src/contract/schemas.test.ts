import { describe, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type { contracts } from "./contracts.ts";

describe("the contracts' prop schemas", () => {
  it("take in exactly what they give out, so a component may be handed the value its guard checked", () => {
    // `isPropsOf` narrows the value it was given; the component receives that
    // value, not the parse's output. This holds only that each prop schema's
    // output type is its input type: a `.default` or a coercion that changes
    // the type is named here, a transform that keeps the type is not.
    // A type test: `pnpm typecheck` (in gate:fast) is what fails on it.
    expectTypeOf<PropsThatReshape>().toEqualTypeOf<never>();
  });
});

type Contracts = typeof contracts;

/** Each prop, as `Component.prop`, whose schema's input type is not its output type. */
type PropsThatReshape = {
  [C in keyof Contracts]: {
    [P in keyof Contracts[C]["props"]]: Same<
      z.input<SchemaOf<Contracts[C]["props"][P]>>,
      z.output<SchemaOf<Contracts[C]["props"][P]>>
    > extends true
      ? never
      : `${C}.${P & string}`;
  }[keyof Contracts[C]["props"]];
}[keyof Contracts];

type SchemaOf<P> = P extends { schema: infer S extends z.ZodType } ? S : never;

/** Whether two types are the same, not merely each assignable to the other. */
type Same<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
