import type { ReactElement } from "react";

import type { AppDiff } from "@origamic/core";

import { TESTIDS } from "./testids.ts";

/**
 * A proposal as the builder reads it before anything is stored: the change
 * set's lines and the app's diff, then Accept or Reject (FIRST-SLICE.md,
 * steps 2 and 7).
 */
export function Proposal({
  explanation,
  changes,
  diff,
  onAccept,
  onReject,
}: ProposalProps): ReactElement {
  return (
    <section
      data-testid={TESTIDS.proposal}
      aria-label="Proposal"
      className="flex flex-col gap-3 rounded-md border border-border p-3"
    >
      <p data-testid={TESTIDS.proposalExplanation} className="text-sm">
        {explanation}
      </p>
      <h3 className="text-sm font-semibold">The ontology</h3>
      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No change.</p>
      ) : (
        <ul className="diff">
          {changes.map((change) => {
            return (
              <li
                key={change}
                data-testid={TESTIDS.proposalChange}
                data-change="changed"
              >
                {change}
              </li>
            );
          })}
        </ul>
      )}
      <h3 className="text-sm font-semibold">The app</h3>
      <ul data-testid={TESTIDS.proposalDiff} className="diff">
        <DiffLines lines={diff.added} change="added" sign="+" />
        <DiffLines lines={diff.removed} change="removed" sign="−" />
        <DiffLines lines={diff.changed} change="changed" sign="~" />
      </ul>
      <div className="flex gap-2">
        <button
          data-testid={TESTIDS.proposalAccept}
          className="button button-primary"
          type="button"
          onClick={onAccept}
        >
          Accept
        </button>
        <button
          data-testid={TESTIDS.proposalReject}
          className="button"
          type="button"
          onClick={onReject}
        >
          Reject
        </button>
      </div>
    </section>
  );
}

export interface ProposalProps {
  /** What the model says it did. */
  explanation: string;
  /** One line per operation of the change set; none when the ontology stays as it is. */
  changes: readonly string[];
  /** What the proposal does to the app: all of it added for a new app. */
  diff: AppDiff;
  onAccept: () => void;
  onReject: () => void;
}

interface DiffLinesProps {
  lines: readonly string[];
  change: "added" | "removed" | "changed";
  sign: string;
}

/** The lines of one kind of change, each after the sign a diff writes for it. */
function DiffLines({ lines, change, sign }: DiffLinesProps): ReactElement {
  return (
    <>
      {lines.map((line) => {
        return (
          <li key={`${change} ${line}`} data-change={change}>
            {sign} {line}
          </li>
        );
      })}
    </>
  );
}
