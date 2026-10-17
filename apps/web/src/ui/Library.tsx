import { type FormEvent, type ReactElement, useState } from "react";

import type { LibraryEntry } from "@origamic/core";
import { useShellViewModel } from "@origamic/runtime";

import { messageOf, textOf } from "./forms.ts";
import { libraryEntryTestId, TESTIDS } from "./testids.ts";

/**
 * The owner's apps, each at its latest version, and a way to open one in a
 * panel at any version it has: how a saved app that no panel shows comes
 * back, and how an old version is seen again (ADR-0005). It reads the view
 * model and hands plain props to the list, which the React Compiler compiles.
 */
export function Library(): ReactElement {
  const { useLibrary, useIntents } = useShellViewModel();
  const { openApp } = useIntents();

  return <LibraryList entries={useLibrary()} onOpen={openApp} />;
}

interface LibraryListProps {
  entries: readonly LibraryEntry[];
  onOpen: (id: string, version: number) => Promise<void>;
}

function LibraryList({ entries, onOpen }: LibraryListProps): ReactElement {
  const [problem, setProblem] = useState<string | null>(null);

  function openApp(id: string, version: number): void {
    setProblem(null);
    // Nothing waits: the panel arrives through the workspace, and a failure
    // is shown here.
    void onOpen(id, version).catch((error: unknown) => {
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
  onOpen: (id: string, version: number) => void;
}

/** An app: its name and latest version, and every version of it to open, the latest first. A version is never changed, so each one is there to open. */
function EntryView({ entry, onOpen }: EntryViewProps): ReactElement {
  const versions = Array.from({ length: entry.latest }, (_, index) => {
    return entry.latest - index;
  });

  function openEntry(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onOpen(entry.id, Number(textOf(event.currentTarget, "version")));
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
      <form className="flex items-center gap-1" onSubmit={openEntry}>
        <select
          // Drawn afresh when a version is saved, so it offers the latest.
          key={entry.latest}
          data-testid={TESTIDS.libraryVersion}
          aria-label={`The version of ${entry.name} to open`}
          className="field py-1 text-xs"
          name="version"
          defaultValue={String(entry.latest)}
        >
          {versions.map((version) => {
            return (
              <option key={version} value={String(version)}>
                v{version}
              </option>
            );
          })}
        </select>
        <button
          data-testid={TESTIDS.libraryOpen}
          className="button button-small"
          type="submit"
        >
          Open
        </button>
      </form>
    </li>
  );
}
