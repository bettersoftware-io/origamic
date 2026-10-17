import { render, within } from "@testing-library/react";

import { Text as TextContract } from "#/contract/components/text.ts";

import { checked } from "./checked.tsx";
import { Text } from "./Text.tsx";

/** A Text behind its contract, handed props as the runtime resolves them: not yet judged. */
export type CheckedPageProps = Readonly<Record<string, unknown>>;

/** What a test can ask of a component behind its contract. */
export interface CheckedPage {
  /** The Text's text, or null when it was not drawn. */
  text: () => string | null;
  /** Each line of the box drawn in its place: the prop, then what is wrong. */
  misfits: () => string[];
}

const TEST_ID = "spec.title";

export function mountChecked(props: CheckedPageProps): CheckedPage {
  const CheckedText = checked(TextContract, Text);
  const rendered = render(
    <CheckedText props={props} emit={ignore} testId={TEST_ID} problems={[]}>
      {null}
    </CheckedText>,
  );
  const shown = within(rendered.container).getByTestId(TEST_ID);
  const refused = shown.getAttribute("role") === "alert";

  return {
    text: (): string | null => {
      return refused ? null : shown.textContent;
    },
    misfits: (): string[] => {
      return refused
        ? within(shown)
            .getAllByRole("listitem")
            .map((item) => {
              return item.textContent;
            })
        : [];
    },
  };
}

/** A Text emits nothing. */
function ignore(): void {
  // It has no event to record.
}
