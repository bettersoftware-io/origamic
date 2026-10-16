import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { JsonValue, Row } from "@origamic/spec";

import { Table } from "./Table.tsx";
import { PARTS, partTestId } from "./testIds.ts";

/** What a test varies of a Table: its rows and its selection. The columns are the book tracker's. */
export interface TablePageProps {
  rows: readonly Row[];
  selected?: string | null;
}

interface Emitted {
  event: string;
  payload: Readonly<Record<string, JsonValue>>;
}

/** What a test can do with, and ask of, a Table. */
export interface TablePage {
  headings: () => string[];
  rowIds: () => string[];
  cellsOf: (id: string) => string[];
  selectedRowIds: () => string[];
  clickRow: (id: string) => Promise<void>;
  /** Moves the keyboard's focus to the row, by Tab, and presses `key` there. */
  pressOnRow: (id: string, key: string) => Promise<void>;
  emitted: () => Emitted[];
}

const TEST_ID = "spec.table";
const ROW = partTestId(TEST_ID, PARTS.row);

export function mountTable({ rows, selected }: TablePageProps): TablePage {
  const user = userEvent.setup();
  const emitted: Emitted[] = [];

  function record(
    event: string,
    payload: Readonly<Record<string, JsonValue>>,
  ): void {
    emitted.push({ event, payload });
  }

  const rendered = render(
    <Table
      props={{
        rows,
        columns: [
          { property: "title", label: "Title" },
          { property: "status", label: "Status" },
          { property: "rating", label: "Rating" },
          { property: "dateFinished", label: "Finished" },
        ],
        ...(selected === undefined ? {} : { selected }),
      }}
      emit={record}
      testId={TEST_ID}
      problems={[]}
    >
      {null}
    </Table>,
  );
  const table = within(rendered.container).getByTestId(TEST_ID);

  function rowsShown(): HTMLElement[] {
    return within(table).queryAllByTestId((testId) => {
      return testId.startsWith(`${ROW}.`);
    });
  }

  function rowOf(id: string): HTMLElement {
    return within(table).getByTestId(partTestId(ROW, id));
  }

  function idOf(row: HTMLElement): string {
    return (row.dataset.testid ?? "").slice(ROW.length + 1);
  }

  return {
    headings: (): string[] => {
      return within(table)
        .getAllByRole("columnheader")
        .map((heading) => {
          return heading.textContent;
        });
    },
    rowIds: (): string[] => {
      return rowsShown().map(idOf);
    },
    cellsOf: (id: string): string[] => {
      return within(rowOf(id))
        .getAllByRole("gridcell")
        .map((cell) => {
          return cell.textContent;
        });
    },
    selectedRowIds: (): string[] => {
      return rowsShown()
        .filter((row) => {
          return row.getAttribute("aria-selected") === "true";
        })
        .map(idOf);
    },
    clickRow: async (id: string): Promise<void> => {
      await user.click(rowOf(id));
    },
    pressOnRow: async (id: string, key: string): Promise<void> => {
      const row = rowOf(id);

      for (let tabs = 0; tabs <= rowsShown().length && !hasFocus(row); tabs++) {
        await user.tab();
      }

      if (!hasFocus(row)) {
        throw new Error(`the row "${id}" cannot be reached by Tab`);
      }

      await user.keyboard(key);
    },
    emitted: (): Emitted[] => {
      return emitted;
    },
  };
}

function hasFocus(element: HTMLElement): boolean {
  return element.ownerDocument.activeElement === element;
}
