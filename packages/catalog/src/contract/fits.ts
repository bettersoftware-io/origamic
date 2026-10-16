import type { Problem } from "@origamic/spec";

import type { ComponentContract, PropsOf } from "./defineComponent.ts";

/** Props as the runtime hands them over, resolved from a spec and not yet judged: a view's rows, a state key's value, a literal. */
export type Unchecked = Readonly<Record<string, unknown>>;

/**
 * Whether `props` are what the contract's component takes: each value one
 * its prop's schema accepts, and no required prop missing. It is the one
 * place a value from a spec becomes a component's typed props.
 */
export function isPropsOf<C extends ComponentContract>(
  contract: C,
  props: Unchecked,
): props is PropsOf<C> {
  return misfitsOf(contract, props).length === 0;
}

/** Each prop the contract refuses: a value its schema does not accept, or a required prop left out. A prop the contract does not name is not judged; no component reads it. */
export function misfitsOf(
  contract: ComponentContract,
  props: Unchecked,
): Problem[] {
  return Object.entries(contract.props).flatMap(([name, prop]) => {
    const value = Object.hasOwn(props, name) ? props[name] : undefined;

    if (value === undefined) {
      return prop.required
        ? [{ path: name, message: `a "${contract.name}" needs "${name}"` }]
        : [];
    }

    const parsed = prop.schema.safeParse(value);

    return parsed.success
      ? []
      : parsed.error.issues.map((issue) => {
          return {
            path: [name, ...issue.path.map(String)].join("."),
            message: issue.message,
          };
        });
  });
}
