import { render, within } from "@testing-library/react";

import { Text } from "./Text.tsx";

/** What a test varies of a Text. */
export interface TextPageProps {
  text: string;
  tone?: "body" | "heading" | "muted";
}

/** What a test can ask of a Text. */
export interface TextPage {
  text: () => string;
  tone: () => string | undefined;
  isHeading: () => boolean;
}

const TEST_ID = "spec.title";

export function mountText({ text, tone }: TextPageProps): TextPage {
  const rendered = render(
    <Text
      props={tone === undefined ? { text } : { text, tone }}
      emit={ignore}
      testId={TEST_ID}
      problems={[]}
    >
      {null}
    </Text>,
  );
  const shown = within(rendered.container).getByTestId(TEST_ID);

  return {
    text: (): string => {
      return shown.textContent;
    },
    tone: (): string | undefined => {
      return shown.dataset.tone;
    },
    isHeading: (): boolean => {
      return (
        within(rendered.container).queryByRole("heading", { name: text }) !==
        null
      );
    },
  };
}

/** A Text emits nothing. */
function ignore(): void {
  // It has no event to record.
}
