import { type FormEvent, type ReactElement, useState } from "react";

import type { BuilderState, LibraryEntry } from "@origamic/core";
import { useShellViewModel } from "@origamic/runtime";
import type { Workspace } from "@origamic/spec";

import { messageOf, textOf } from "./forms.ts";
import { Proposal } from "./Proposal.tsx";
import { TESTIDS } from "./testids.ts";

/**
 * The conversation with the model: what it works on, what is asked, and what
 * the model proposes (FIRST-SLICE.md, steps 1, 2 and 7). It reads the view
 * model and hands plain props to the view, which the React Compiler compiles.
 */
export function Builder({
  target,
  activePanel,
  onNewApp,
  onRevise,
}: BuilderProps): ReactElement {
  const { useBuilder, useWorkspace, useLibrary, useIntents } =
    useShellViewModel();
  const { ask, accept, reject } = useIntents();
  const state = useBuilder();
  const workspace = useWorkspace();
  const library = useLibrary();
  // A panel the workspace no longer has (closed since it was active) is
  // not revised: the builder works on a new app.
  const revising = describePanel(target, workspace, library);

  return (
    <BuilderView
      state={state}
      target={revising}
      activePanel={describePanel(activePanel, workspace, library)}
      panel={revising === null ? null : target}
      onAsk={ask}
      onAccept={accept}
      onReject={reject}
      onNewApp={onNewApp}
      onRevise={onRevise}
    />
  );
}

export interface BuilderProps {
  /** The panel whose app the builder revises, or `null` for a new app. */
  target: string | null;
  /** The panel that is active in the workspace, which the builder can be turned to; `null` when there is none. */
  activePanel: string | null;
  onNewApp: () => void;
  onRevise: () => void;
}

interface BuilderViewProps {
  state: BuilderState;
  /** What the builder works on, worded: `null` for a new app. */
  target: string | null;
  /** The active panel's app, worded, or `null` when no panel is active. */
  activePanel: string | null;
  /** The panel asked about, or `null` for a new app. */
  panel: string | null;
  onAsk: (intent: string, panel: string | null) => Promise<void>;
  onAccept: () => Promise<void>;
  onReject: () => void;
  onNewApp: () => void;
  onRevise: () => void;
}

function BuilderView({
  state,
  target,
  activePanel,
  panel,
  onAsk,
  onAccept,
  onReject,
  onNewApp,
  onRevise,
}: BuilderViewProps): ReactElement {
  const [problem, setProblem] = useState<string | null>(null);

  function askModel(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const intent = textOf(event.currentTarget, "intent").trim();

    if (intent === "") {
      return;
    }

    setProblem(null);
    // Nothing waits: what the ask does shows in the builder's state, and a
    // refusal before anything is asked is shown here.
    void onAsk(intent, panel).catch((error: unknown) => {
      setProblem(messageOf(error));
    });
  }

  function acceptProposal(): void {
    // The builder's state says how the accept went, a failure included.
    void onAccept();
  }

  return (
    <section
      data-testid={TESTIDS.builder}
      aria-label="Builder"
      className="flex flex-col gap-3"
    >
      <h2 className="text-base font-semibold">Builder</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span data-testid={TESTIDS.builderTarget}>
          {target === null ? "A new app" : `Revising ${target}`}
        </span>
        {target !== null ? (
          <button
            data-testid={TESTIDS.builderNewApp}
            className="button button-small"
            type="button"
            onClick={onNewApp}
          >
            New app instead
          </button>
        ) : null}
        {target === null && activePanel !== null ? (
          <button
            data-testid={TESTIDS.builderRevise}
            className="button button-small"
            type="button"
            onClick={onRevise}
          >
            Revise {activePanel} instead
          </button>
        ) : null}
      </div>
      <form className="flex flex-col gap-2" onSubmit={askModel}>
        <label className="flex flex-col gap-1 text-sm">
          What should it build or change?
          <textarea
            data-testid={TESTIDS.builderIntent}
            className="field min-h-24"
            name="intent"
            maxLength={4000}
            required={true}
          />
        </label>
        <button
          data-testid={TESTIDS.builderAsk}
          className="button button-primary self-start"
          type="submit"
          disabled={state.kind === "accepting"}
        >
          Ask
        </button>
      </form>
      {problem === null ? null : (
        <p
          data-testid={TESTIDS.builderRefused}
          role="alert"
          className="text-sm text-destructive"
        >
          {problem}
        </p>
      )}
      <BuilderStateView
        state={state}
        onAccept={acceptProposal}
        onReject={onReject}
      />
    </section>
  );
}

interface BuilderStateViewProps {
  state: BuilderState;
  onAccept: () => void;
  onReject: () => void;
}

/** Where the conversation stands: the model's progress, its proposal, the save, or why it failed. */
function BuilderStateView({
  state,
  onAccept,
  onReject,
}: BuilderStateViewProps): ReactElement | null {
  switch (state.kind) {
    case "idle":
      return null;

    case "generating":
      return (
        <ol
          data-testid={TESTIDS.builderProgress}
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          <li>Asking the model…</li>
          {state.progress.map((line, index) => {
            return <li key={`${String(index)} ${line}`}>{line}</li>;
          })}
        </ol>
      );

    case "proposed":
      return (
        <Proposal
          explanation={state.proposal.explanation}
          changes={state.changes}
          diff={state.diff}
          onAccept={onAccept}
          onReject={onReject}
        />
      );

    case "accepting":
      return (
        <p aria-live="polite" className="text-sm text-muted-foreground">
          Saving…
        </p>
      );

    case "failed":
      return (
        <div
          data-testid={TESTIDS.builderProblem}
          role="alert"
          className="flex flex-col gap-1 text-sm text-destructive"
        >
          <p>{state.message}</p>
          <ul>
            {state.problems.map((problem) => {
              return (
                <li key={`${problem.path} ${problem.message}`}>
                  {problem.path === ""
                    ? problem.message
                    : `${problem.path}: ${problem.message}`}
                </li>
              );
            })}
          </ul>
        </div>
      );
  }
}

/** A panel as the builder names it: its app's name and the version it pins; `null` for no panel. */
function describePanel(
  panel: string | null,
  workspace: Workspace | null,
  library: readonly LibraryEntry[],
): string | null {
  if (panel === null || workspace === null) {
    return null;
  }

  const pin = Object.hasOwn(workspace.panels, panel)
    ? workspace.panels[panel]
    : undefined;

  if (pin === undefined) {
    return null;
  }

  const name =
    library.find((entry) => {
      return entry.id === pin.app;
    })?.name ?? pin.app;

  return `${name}, version ${String(pin.appVersion)}`;
}
