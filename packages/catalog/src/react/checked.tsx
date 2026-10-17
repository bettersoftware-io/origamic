import type { ComponentType, ReactElement } from "react";

import type { ComponentContract, PropsOf } from "#/contract/defineComponent.ts";
import { isPropsOf, misfitsOf, type Unchecked } from "#/contract/fits.ts";

import type { Envelope } from "./envelope.ts";
import { Misfit } from "./Misfit.tsx";

/**
 * A component behind its contract: it is drawn with props its contract's
 * schemas accept, and a box that says which prop does not fit is drawn in
 * its place otherwise. A spec that passed `validateApp` can still hand a
 * component a value it does not take, since a state key holds whatever a
 * handler set it to; the box shows that rather than a broken component.
 */
export function checked<C extends ComponentContract>(
  contract: C,
  Component: ComponentType<Envelope<PropsOf<C>>>,
): ComponentType<Envelope<Unchecked>> {
  function Checked({
    props,
    children,
    emit,
    testId,
    problems,
  }: Envelope<Unchecked>): ReactElement {
    if (isPropsOf(contract, props)) {
      return (
        <Component
          props={props}
          emit={emit}
          testId={testId}
          problems={problems}
        >
          {children}
        </Component>
      );
    }

    return (
      <Misfit
        name={contract.name}
        misfits={misfitsOf(contract, props)}
        testId={testId}
      />
    );
  }

  return Checked;
}
