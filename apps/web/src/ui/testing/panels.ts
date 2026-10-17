import { waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

import {
  panelTestId,
  SPEC_PARTS,
  specElementTestId,
  specPartTestId,
  TESTIDS,
} from "../testids.ts";

/** The workspace's panels as a page object reads them, each app in its panel by the ids of its spec. */
export interface PanelsReader {
  /** The ids of the panels on screen. */
  panels: () => string[];
  /** The panel's caption: its app's name and the version it pins. Waits until the panel shows its app's table. */
  caption: (panel: string) => Promise<string>;
  /** The title cell of each row of the app's table in the panel, once it is drawn. */
  bookTitles: (panel: string) => Promise<string[]>;
  /** The cells of the row whose title is `title`. */
  cellsOf: (panel: string, title: string) => string[];
  /** Adds a book through the app's form in the panel, and waits until the table shows it. */
  addBook: (panel: string, title: string) => Promise<void>;
}

/** Reads the panels drawn inside `container`, and adds books as a person does. */
export function readPanels(
  container: HTMLElement,
  user: UserEvent,
): PanelsReader {
  const view = within(container);

  function panelOf(panel: string): HTMLElement {
    return view.getByTestId(panelTestId(panel));
  }

  function rowsOf(panel: string): HTMLElement[] {
    const prefix = `${specPartTestId("table", SPEC_PARTS.row)}.`;

    return within(panelOf(panel)).queryAllByTestId((id) => {
      return id.startsWith(prefix);
    });
  }

  async function caption(panel: string): Promise<string> {
    await view.findByTestId(panelTestId(panel));
    await within(panelOf(panel)).findByTestId(specElementTestId("table"));

    return within(panelOf(panel)).getByTestId(TESTIDS.panelCaption).textContent;
  }

  async function bookTitles(panel: string): Promise<string[]> {
    await caption(panel);

    return rowsOf(panel).map(titleOf);
  }

  return {
    panels: (): string[] => {
      const prefix = `${TESTIDS.panel}.`;

      return view
        .queryAllByTestId((id) => {
          return id.startsWith(prefix);
        })
        .map((element) => {
          return (element.dataset.testid ?? "").slice(prefix.length);
        });
    },
    caption,
    bookTitles,
    cellsOf: (panel: string, title: string): string[] => {
      const row = rowsOf(panel).find((each) => {
        return titleOf(each) === title;
      });

      if (row === undefined) {
        throw new Error(`no row for "${title}"`);
      }

      return cellsIn(row);
    },
    addBook: async (panel: string, title: string): Promise<void> => {
      await bookTitles(panel);

      const form = within(panelOf(panel)).getByTestId(
        specElementTestId("addForm"),
      );

      const field = within(form).getByTestId(
        specPartTestId("addForm", SPEC_PARTS.field, "title"),
      );

      await user.type(within(field).getByRole("textbox"), title);
      await user.click(
        within(form).getByTestId(specPartTestId("addForm", SPEC_PARTS.submit)),
      );
      await waitFor(() => {
        if (!rowsOf(panel).map(titleOf).includes(title)) {
          throw new Error(`no row for "${title}" yet`);
        }
      });
    },
  };
}

function cellsIn(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole("gridcell")
    .map((cell) => {
      return cell.textContent;
    });
}

function titleOf(row: HTMLElement): string {
  return cellsIn(row)[0] ?? "";
}
