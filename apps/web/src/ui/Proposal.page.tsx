import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AppDiff } from "@origamic/core";

import { Proposal } from "./Proposal.tsx";
import { TESTIDS } from "./testids.ts";

/** What a test varies of a proposal: what it says it changes. */
export interface ProposalPageProps {
  changes?: readonly string[];
  diff?: AppDiff;
}

/** What a test can do with, and ask of, a proposal on screen. */
export interface ProposalPage {
  explanation: () => string;
  /** The change set's lines, in order. */
  changes: () => string[];
  /** What the ontology part says when the change set has no line. */
  noChange: () => string | null;
  /** The app's diff, a line each, as written: `+ element table`. */
  diff: () => string[];
  accept: () => Promise<void>;
  reject: () => Promise<void>;
  /** How many times each button reached its slot. */
  answers: () => Answers;
}

interface Answers {
  accepted: number;
  rejected: number;
}

/** Mounts a proposal for the book tracker's date, unless the test says otherwise. */
export function mountProposal({
  changes = ["Book: add dateFinished (date, optional)"],
  diff = {
    added: ["element editForm"],
    removed: ["binding updateBook@1"],
    changed: ["binding Book@1 → Book@2"],
  },
}: ProposalPageProps = {}): ProposalPage {
  const user = userEvent.setup();
  const answers: Answers = { accepted: 0, rejected: 0 };

  function countAccept(): void {
    answers.accepted += 1;
  }

  function countReject(): void {
    answers.rejected += 1;
  }

  const view = within(
    render(
      <Proposal
        explanation="A date finished on Book."
        changes={changes}
        diff={diff}
        onAccept={countAccept}
        onReject={countReject}
      />,
    ).container,
  );

  return {
    explanation: (): string => {
      return view.getByTestId(TESTIDS.proposalExplanation).textContent;
    },
    changes: (): string[] => {
      return view.queryAllByTestId(TESTIDS.proposalChange).map((line) => {
        return line.textContent;
      });
    },
    noChange: (): string | null => {
      return view.queryByText("No change.")?.textContent ?? null;
    },
    diff: (): string[] => {
      return within(view.getByTestId(TESTIDS.proposalDiff))
        .queryAllByRole("listitem")
        .map((line) => {
          return line.textContent;
        });
    },
    accept: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.proposalAccept));
    },
    reject: async (): Promise<void> => {
      await user.click(view.getByTestId(TESTIDS.proposalReject));
    },
    answers: (): Answers => {
      return { ...answers };
    },
  };
}
