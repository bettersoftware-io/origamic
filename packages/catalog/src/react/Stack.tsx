import type { ReactElement } from "react";

import type { Stack as StackContract } from "#/contract/components/stack.ts";
import type { PropsOf } from "#/contract/defineComponent.ts";

import type { Envelope } from "./envelope.ts";

/** Its children one under the other, in order. */
export function Stack({
  props,
  children,
  testId,
}: Envelope<StackProps>): ReactElement {
  const gap = props.gap ?? "medium";

  return (
    <div
      data-testid={testId}
      data-gap={gap}
      className={`flex flex-col ${GAPS[gap]}`}
    >
      {children}
    </div>
  );
}

type StackProps = PropsOf<typeof StackContract>;

const GAPS = { small: "gap-2", medium: "gap-4", large: "gap-8" } as const;
