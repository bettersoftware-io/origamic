import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { JsonValue } from "@origamic/spec";

import { Select } from "./Select.tsx";
import { PARTS, partTestId } from "./testIds.ts";

/** What a test varies of a Select: the rest is the book tracker's status filter. */
export interface SelectPageProps {
  emptyLabel?: string;
  value?: string | null;
}

interface Emitted {
  event: string;
  payload: Readonly<Record<string, JsonValue>>;
}

/** What a test can do with, and ask of, a Select. */
export interface SelectPage {
  choose: (label: string) => Promise<void>;
  offered: () => Promise<string[]>;
  shown: () => string;
  emitted: () => Emitted[];
}

const TEST_ID = "spec.statusFilter";

export function mountSelect({
  emptyLabel,
  value = null,
}: SelectPageProps): SelectPage {
  const user = userEvent.setup();
  const emitted: Emitted[] = [];

  function record(
    event: string,
    payload: Readonly<Record<string, JsonValue>>,
  ): void {
    emitted.push({ event, payload });
  }

  const rendered = render(
    <Select
      props={{
        label: "Status",
        options: ["want", "reading", "done"],
        value,
        ...(emptyLabel === undefined ? {} : { emptyLabel }),
      }}
      emit={record}
      testId={TEST_ID}
      problems={[]}
    >
      {null}
    </Select>,
  );

  const trigger = within(rendered.container).getByTestId(
    partTestId(TEST_ID, PARTS.trigger),
  );

  async function open(): Promise<HTMLElement[]> {
    await user.click(trigger);

    return screen.getAllByRole("option");
  }

  return {
    choose: async (label: string): Promise<void> => {
      const option = (await open()).find((candidate) => {
        return candidate.textContent === label;
      });

      if (option === undefined) {
        throw new Error(`the Select offers no "${label}"`);
      }

      await user.click(option);
    },
    offered: async (): Promise<string[]> => {
      return (await open()).map((option) => {
        return option.textContent;
      });
    },
    shown: (): string => {
      return trigger.textContent;
    },
    emitted: (): Emitted[] => {
      return emitted;
    },
  };
}
