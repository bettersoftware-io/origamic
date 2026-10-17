import type { Locator, Page } from "@playwright/test";

import {
  panelTestId,
  SPEC_PARTS,
  specElementTestId,
  specPartTestId,
} from "@origamic/web/src/ui/testids.ts";

/** One row of the book tracker's table, as a builder reads it. */
interface ShownBook {
  title: string;
  /** Every cell of the row, the title first. */
  cells: string[];
}

/** What a spec can do with, and ask of, the book tracker an app's spec draws in a panel, by the ids of its elements. */
export interface SpecAppPage {
  /** Adds a book through the app's add form, and waits until its table shows it. */
  addBook: (panel: string, title: string) => Promise<void>;
  /** Every row of the app's table, read in one step; empty until the table is drawn. */
  books: (panel: string) => Promise<ShownBook[]>;
}

export function createSpecAppPage(page: Page): SpecAppPage {
  function elementIn(panel: string, element: string): Locator {
    return page
      .getByTestId(panelTestId(panel))
      .getByTestId(specElementTestId(element));
  }

  async function books(panel: string): Promise<ShownBook[]> {
    const table = elementIn(panel, "table");

    if ((await table.count()) === 0) {
      return [];
    }

    const prefix = specPartTestId("table", SPEC_PARTS.row);

    return table.locator(`[data-testid^="${prefix}."]`).evaluateAll((rows) => {
      return rows.map((row) => {
        const cells = [...row.querySelectorAll('[role="gridcell"]')].map(
          (cell) => {
            return cell.textContent ?? "";
          },
        );

        return { title: cells[0] ?? "", cells };
      });
    });
  }

  return {
    addBook: async (panel: string, title: string): Promise<void> => {
      const form = elementIn(panel, "addForm");

      await form
        .getByTestId(specPartTestId("addForm", SPEC_PARTS.field, "title"))
        .getByRole("textbox")
        .fill(title);
      await form
        .getByTestId(specPartTestId("addForm", SPEC_PARTS.submit))
        .click();
      await elementIn(panel, "table")
        .getByRole("gridcell", { name: title, exact: true })
        .waitFor();
    },
    books,
  };
}
