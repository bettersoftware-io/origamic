import { render, within } from "@testing-library/react";

import { Stack } from "./Stack.tsx";

/** What a test varies of a Stack: the text of each child, and its gap. */
export interface StackPageProps {
  children: string[];
  gap?: "small" | "medium" | "large";
}

/** What a test can ask of a Stack. */
export interface StackPage {
  children: () => string[];
  gap: () => string | undefined;
}

const TEST_ID = "spec.page";

export function mountStack({ children, gap }: StackPageProps): StackPage {
  const rendered = render(
    <Stack
      props={gap === undefined ? {} : { gap }}
      emit={ignore}
      testId={TEST_ID}
      problems={[]}
    >
      {children.map((text) => {
        return <p key={text}>{text}</p>;
      })}
    </Stack>,
  );
  const stack = within(rendered.container).getByTestId(TEST_ID);

  return {
    children: (): string[] => {
      return [...stack.children].map((child) => {
        return child.textContent;
      });
    },
    gap: (): string | undefined => {
      return stack.dataset.gap;
    },
  };
}

/** A Stack emits nothing. */
function ignore(): void {
  // It has no event to record.
}
