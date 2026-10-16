import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PARTS, partTestId } from "@origamic/catalog";
import type { AppSession } from "@origamic/core";
import type { App } from "@origamic/spec";

import { AppView } from "./AppView.tsx";
import { elementTestId } from "./elementTestId.ts";

/** What a test hands the view: an app, and the session open on it. */
export interface AppViewPageProps {
  app: App;
  session: AppSession;
}

/** What a test can do with, and ask of, an app on screen. Each element is named by its id in the spec. */
export interface AppViewPage {
  /** Fills each field named, a select field by choosing the option, then presses the form's button and waits until the form is drawn afresh or shows a problem. */
  submitForm: (
    formId: string,
    values: Readonly<Record<string, string>>,
  ) => Promise<void>;
  /** Fills each field named, a select field by choosing the option, and submits nothing. */
  fillForm: (
    formId: string,
    values: Readonly<Record<string, string>>,
  ) => Promise<void>;
  /** Chooses the option of a Select by its label, and waits until it shows it. */
  choose: (selectId: string, label: string) => Promise<void>;
  /** Clicks the row, and waits until it is marked as selected. */
  selectRow: (tableId: string, rowId: string) => Promise<void>;
  /** The first cell of each row of the table `table`, in order, once the table is drawn: the app draws it only when every view it reads has its rows. */
  bookTitles: () => Promise<string[]>;
  /** Draws the view again with this app and session, as a panel does when its workspace changes. */
  show: (app: App, session: AppSession) => Promise<void>;
  cellsOf: (tableId: string, rowId: string) => string[];
  selectedRows: (tableId: string) => string[];
  /** What a field of a form shows. */
  shownIn: (formId: string, field: string) => string;
  problemsBeside: (formId: string, field: string) => string[];
  /** The problems a form shows at its top, about no one field. */
  problemsOf: (formId: string) => string[];
  notice: (formId: string) => string | null;
  /** What is drawn in an element's place when it cannot be: its text, or null when the element is drawn. */
  alert: (elementId: string) => string | null;
}

export function mountAppView({ app, session }: AppViewPageProps): AppViewPage {
  const user = userEvent.setup();
  const rendered = render(<AppView app={app} session={session} />);
  const view = within(rendered.container);

  function elementOf(id: string): HTMLElement {
    return view.getByTestId(elementTestId(id));
  }

  function fieldOf(formId: string, field: string): HTMLElement {
    return within(elementOf(formId)).getByTestId(
      partTestId(partTestId(elementTestId(formId), PARTS.field), field),
    );
  }

  function controlOf(formId: string, field: string): HTMLElement {
    const label = within(fieldOf(formId, field)).getByText(/./, {
      selector: "label",
    });

    return within(elementOf(formId)).getByLabelText(label.textContent);
  }

  function rowsOf(tableId: string): HTMLElement[] {
    const prefix = `${partTestId(elementTestId(tableId), PARTS.row)}.`;

    return within(elementOf(tableId)).queryAllByTestId((testId) => {
      return testId.startsWith(prefix);
    });
  }

  function rowIdOf(tableId: string, row: HTMLElement): string {
    const prefix = partTestId(elementTestId(tableId), PARTS.row);

    return (row.dataset.testid ?? "").slice(prefix.length + 1);
  }

  function rowOf(tableId: string, rowId: string): HTMLElement {
    return within(elementOf(tableId)).getByTestId(
      partTestId(partTestId(elementTestId(tableId), PARTS.row), rowId),
    );
  }

  function cellsIn(row: HTMLElement): string[] {
    return within(row)
      .getAllByRole("gridcell")
      .map((cell) => {
        return cell.textContent;
      });
  }

  function textsOf(elements: HTMLElement[]): string[] {
    return elements.map((element) => {
      return element.textContent;
    });
  }

  async function fill(
    formId: string,
    field: string,
    text: string,
  ): Promise<void> {
    const control = controlOf(formId, field);

    if (control.getAttribute("role") === "combobox") {
      await user.click(control);
      await user.click(screen.getByRole("option", { name: text }));

      return;
    }

    await user.clear(control);
    await user.type(control, text);
  }

  function problemsIn(formId: string): HTMLElement[] {
    return within(elementOf(formId)).queryAllByRole("alert");
  }

  async function fillForm(
    formId: string,
    values: Readonly<Record<string, string>>,
  ): Promise<void> {
    for (const [field, text] of Object.entries(values)) {
      await fill(formId, field, text);
    }
  }

  return {
    fillForm,
    submitForm: async (
      formId: string,
      values: Readonly<Record<string, string>>,
    ): Promise<void> => {
      await fillForm(formId, values);

      const before = elementOf(formId);

      await user.click(
        within(before).getByTestId(
          partTestId(elementTestId(formId), PARTS.submit),
        ),
      );
      await waitFor(() => {
        if (elementOf(formId) === before && problemsIn(formId).length === 0) {
          throw new Error(`"${formId}" was neither drawn afresh nor refused`);
        }
      });
    },
    choose: async (selectId: string, label: string): Promise<void> => {
      const trigger = within(elementOf(selectId)).getByTestId(
        partTestId(elementTestId(selectId), PARTS.trigger),
      );

      await user.click(trigger);
      await user.click(screen.getByRole("option", { name: label }));
      await waitFor(() => {
        if (trigger.textContent !== label) {
          throw new Error(`"${selectId}" does not show "${label}"`);
        }
      });
    },
    selectRow: async (tableId: string, rowId: string): Promise<void> => {
      await user.click(rowOf(tableId, rowId));
      await waitFor(() => {
        if (rowOf(tableId, rowId).getAttribute("aria-selected") !== "true") {
          throw new Error(`the row "${rowId}" is not selected`);
        }
      });
    },
    bookTitles: async (): Promise<string[]> => {
      await view.findByTestId(elementTestId("table"));

      return rowsOf("table").map((row) => {
        return cellsIn(row)[0] ?? "";
      });
    },
    show: async (next: App, nextSession: AppSession): Promise<void> => {
      await act(async () => {
        rendered.rerender(<AppView app={next} session={nextSession} />);
      });
    },
    cellsOf: (tableId: string, rowId: string): string[] => {
      return cellsIn(rowOf(tableId, rowId));
    },
    selectedRows: (tableId: string): string[] => {
      return rowsOf(tableId)
        .filter((row) => {
          return row.getAttribute("aria-selected") === "true";
        })
        .map((row) => {
          return rowIdOf(tableId, row);
        });
    },
    shownIn: (formId: string, field: string): string => {
      const control = controlOf(formId, field);

      return control instanceof HTMLInputElement
        ? control.value
        : control.textContent;
    },
    problemsBeside: (formId: string, field: string): string[] => {
      const beside = partTestId(
        partTestId(partTestId(elementTestId(formId), PARTS.field), field),
        PARTS.problem,
      );

      return textsOf(within(fieldOf(formId, field)).queryAllByTestId(beside));
    },
    problemsOf: (formId: string): string[] => {
      return textsOf(
        within(elementOf(formId)).queryAllByTestId(
          partTestId(elementTestId(formId), PARTS.problem),
        ),
      );
    },
    notice: (formId: string): string | null => {
      return (
        within(elementOf(formId)).queryByTestId(
          partTestId(elementTestId(formId), PARTS.notice),
        )?.textContent ?? null
      );
    },
    alert: (elementId: string): string | null => {
      const element = elementOf(elementId);

      return element.getAttribute("role") === "alert"
        ? element.textContent
        : null;
    },
  };
}
