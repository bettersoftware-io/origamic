import { type ReactElement, useState } from "react";

import type { LibraryEntry } from "@origamic/core";
import { useShellViewModel } from "@origamic/runtime";

import { messageOf } from "./forms.ts";
import { libraryEntryTestId, TESTIDS } from "./testids.ts";

/**
 * The owner's apps, each at its latest version, and a way to open one in a
 * panel: how a saved app that no panel shows comes back. It reads the view
 * model and hands plain props to the list, which the React Compiler compiles.
 */
export function Library(): ReactElement {
  const { useLibrary, useIntents } = useShellViewModel();
  const { openApp } = useIntents();

  return <LibraryList entries={useLibrary()} onOpen={openApp} />;
}

interface LibraryListProps {
  entries: readonly LibraryEntry[];
  onOpen: (id: string) => Promise<void>;
}

function LibraryList({ entries, onOpen }: LibraryListProps): ReactElement {
  const [problem, setProblem] = useState<string | null>(null);

  function openApp(id: string): void {
    setProblem(null);
    // Nothing waits: the panel arrives through the workspace, and a failure
    // is shown here.
    void onOpen(id).catch((error: unknown) => {
      setProblem(messageOf(error));
    });
  }

  return (
    <section
      data-testid={TESTIDS.library}
      aria-label="Library"
      className="flex flex-col gap-2"
    >
      <h2 className="text-base font-semibold">Library</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No app saved yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {entries.map((entry) => {
            return <EntryView key={entry.id} entry={entry} onOpen={openApp} />;
          })}
        </ul>
      )}
      {problem === null ? null : (
        <p
          data-testid={TESTIDS.libraryProblem}
          role="alert"
          className="text-sm text-destructive"
        >
          {problem}
        </p>
      )}
    </section>
  );
}

interface EntryViewProps {
  entry: LibraryEntry;
  onOpen: (id: string) => void;
}

function EntryView({ entry, onOpen }: EntryViewProps): ReactElement {
  function openEntry(): void {
    onOpen(entry.id);
  }

  return (
    <li
      data-testid={libraryEntryTestId(entry.id)}
      className="flex items-center justify-between gap-2 text-sm"
    >
      <span>
        {entry.name}{" "}
        <span className="text-muted-foreground">
          version {String(entry.latest)}
        </span>
      </span>
      <button
        data-testid={TESTIDS.libraryOpen}
        className="button button-small"
        type="button"
        onClick={openEntry}
      >
        Open
      </button>
    </li>
  );
}
