import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import type { JsonValue, Problem } from "@origamic/spec";

import type { Envelope } from "./envelope.ts";
import { Form } from "./Form.tsx";
import { PARTS, partTestId } from "./testIds.ts";

/** What a test varies of a Form. Its fields are a book's, one of each kind of input. */
export interface FormPageProps {
  mode: "create" | "edit";
  values?: Readonly<Record<string, JsonValue>> | null;
  problems?: readonly Problem[];
}

interface Emitted {
  event: string;
  payload: Readonly<Record<string, JsonValue>>;
}

/** What a test can do with, and ask of, a Form. */
export interface FormPage {
  fill: (field: string, text: string) => Promise<void>;
  choose: (field: string, option: string) => Promise<void>;
  check: (field: string) => Promise<void>;
  submit: () => Promise<void>;
  /** Gives the form other values to edit, as selecting another row does. */
  edit: (values: Readonly<Record<string, JsonValue>>) => void;
  shown: (field: string) => string;
  notice: () => string | null;
  problemsBeside: (field: string) => string[];
  problemsOfTheForm: () => string[];
  emitted: () => Emitted[];
}

const TEST_ID = "spec.editForm";

export function mountForm({
  mode,
  values,
  problems = [],
}: FormPageProps): FormPage {
  const user = userEvent.setup();
  const emitted: Emitted[] = [];

  function record(
    event: string,
    payload: Readonly<Record<string, JsonValue>>,
  ): void {
    emitted.push({ event, payload });
  }

  const rendered = render(
    <BookForm mode={mode} values={values} problems={problems} emit={record} />,
  );

  /** The form as it is now: it is drawn afresh when its values change. */
  function current(): HTMLElement {
    return within(rendered.container).getByTestId(TEST_ID);
  }

  function fieldTestId(name: string): string {
    return partTestId(partTestId(TEST_ID, PARTS.field), name);
  }

  function fieldOf(name: string): HTMLElement {
    return within(current()).getByTestId(fieldTestId(name));
  }

  function controlOf(name: string): HTMLElement {
    const label = within(fieldOf(name)).getByText(/./, { selector: "label" });

    return within(current()).getByLabelText(label.textContent);
  }

  function messages(elements: HTMLElement[]): string[] {
    return elements.map((element) => {
      return element.textContent;
    });
  }

  return {
    fill: async (field: string, text: string): Promise<void> => {
      const control = controlOf(field);

      await user.clear(control);
      await user.type(control, text);
    },
    choose: async (field: string, option: string): Promise<void> => {
      await user.click(controlOf(field));
      await user.click(screen.getByRole("option", { name: option }));
    },
    check: async (field: string): Promise<void> => {
      await user.click(controlOf(field));
    },
    submit: async (): Promise<void> => {
      await user.click(
        within(current()).getByTestId(partTestId(TEST_ID, PARTS.submit)),
      );
    },
    edit: (next: Readonly<Record<string, JsonValue>>): void => {
      rendered.rerender(
        <BookForm
          mode={mode}
          values={next}
          problems={problems}
          emit={record}
        />,
      );
    },
    shown: (field: string): string => {
      const control = controlOf(field);

      return control instanceof HTMLInputElement
        ? control.value
        : control.textContent;
    },
    notice: (): string | null => {
      return (
        within(current()).queryByTestId(partTestId(TEST_ID, PARTS.notice))
          ?.textContent ?? null
      );
    },
    problemsBeside: (field: string): string[] => {
      return messages(
        within(fieldOf(field)).queryAllByTestId(
          partTestId(fieldTestId(field), PARTS.problem),
        ),
      );
    },
    problemsOfTheForm: (): string[] => {
      return messages(
        within(current()).queryAllByTestId(partTestId(TEST_ID, PARTS.problem)),
      );
    },
    emitted: (): Emitted[] => {
      return emitted;
    },
  };
}

interface BookFormProps extends FormPageProps {
  emit: Envelope<never>["emit"];
}

/** A Form with a book's fields, one of each kind of input. */
function BookForm({
  mode,
  values,
  problems = [],
  emit,
}: BookFormProps): ReactElement {
  return (
    <Form
      props={{
        fields: [
          { name: "title", label: "Title", input: "text" },
          { name: "notes", label: "Notes", input: "longText" },
          {
            name: "status",
            label: "Status",
            input: "select",
            options: ["want", "reading", "done"],
          },
          { name: "rating", label: "Rating", input: "number" },
          { name: "dateFinished", label: "Finished", input: "date" },
          { name: "reading", label: "Reading now", input: "checkbox" },
        ],
        submitLabel: "Save",
        mode,
        ...(values === undefined ? {} : { values }),
      }}
      emit={emit}
      testId={TEST_ID}
      problems={problems}
    >
      {null}
    </Form>
  );
}
