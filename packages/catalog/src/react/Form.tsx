import { type FormEvent, type ReactElement, useId } from "react";

import type { JsonValue, Problem } from "@origamic/spec";

import type { Form as FormContract } from "#/contract/components/form.ts";
import type { PropsOf } from "#/contract/defineComponent.ts";

import type { Envelope } from "./envelope.ts";
import { Button } from "./primitives/Button.tsx";
import { Checkbox } from "./primitives/Checkbox.tsx";
import { Input } from "./primitives/Input.tsx";
import { Label } from "./primitives/Label.tsx";
import { Select as SelectRoot } from "./primitives/select/Select.tsx";
import { SelectContent } from "./primitives/select/SelectContent.tsx";
import { SelectItem } from "./primitives/select/SelectItem.tsx";
import { SelectTrigger } from "./primitives/select/SelectTrigger.tsx";
import { SelectValue } from "./primitives/select/SelectValue.tsx";
import { PARTS, partTestId } from "./testIds.ts";

/**
 * Fields to fill in and a button. Submitting emits one field per entry of
 * `fields`: a number field a number, a checkbox true or false, and an empty
 * field is left out. An edit form shows `values`, and while they are null it
 * says so and submits nothing.
 *
 * What is typed stays in the inputs until it is submitted; the form is drawn
 * afresh, from the values it edits, each time those change.
 */
export function Form({
  props,
  emit,
  testId,
  problems,
}: Envelope<FormProps>): ReactElement {
  const values = props.values ?? null;
  const waiting = props.mode === "edit" && values === null;
  const names = props.fields.map((field) => {
    return field.name;
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    emit("submit", payloadOf(props.fields, new FormData(event.currentTarget)));
  }

  return (
    <form
      key={JSON.stringify(values)}
      data-testid={testId}
      className="flex flex-col gap-4"
      onSubmit={submit}
    >
      {waiting ? (
        <p
          data-testid={partTestId(testId, PARTS.notice)}
          className="text-sm text-muted-foreground"
        >
          Select a row to edit
        </p>
      ) : null}
      <Problems
        problems={problems.filter((problem) => {
          return !names.includes(problem.path);
        })}
        testId={partTestId(testId, PARTS.problem)}
      />
      <fieldset disabled={waiting} className="flex flex-col gap-4">
        {props.fields.map((field) => {
          return (
            <FieldView
              key={field.name}
              field={field}
              value={values?.[field.name] ?? null}
              problems={problems.filter((problem) => {
                return problem.path === field.name;
              })}
              testId={partTestId(partTestId(testId, PARTS.field), field.name)}
            />
          );
        })}
        <Button type="submit" data-testid={partTestId(testId, PARTS.submit)}>
          {props.submitLabel}
        </Button>
      </fieldset>
    </form>
  );
}

type FormProps = PropsOf<typeof FormContract>;
type Field = FormProps["fields"][number];
type Values = Readonly<Record<string, JsonValue>>;

interface FieldViewProps {
  field: Field;
  value: JsonValue;
  problems: readonly Problem[];
  testId: string;
}

function FieldView({
  field,
  value,
  problems,
  testId,
}: FieldViewProps): ReactElement {
  const id = useId();

  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      <Label htmlFor={id}>{field.label}</Label>
      <FieldInput id={id} field={field} value={value} />
      <Problems
        problems={problems}
        testId={partTestId(testId, PARTS.problem)}
      />
    </div>
  );
}

interface FieldInputProps {
  id: string;
  field: Field;
  value: JsonValue;
}

function FieldInput({ id, field, value }: FieldInputProps): ReactElement {
  const { name } = field;

  switch (field.input) {
    case "text":
      return <Input id={id} name={name} defaultValue={textOf(value)} />;
    case "longText":
      return (
        <textarea
          id={id}
          name={name}
          defaultValue={textOf(value)}
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        />
      );
    case "number":
      return (
        <Input
          id={id}
          name={name}
          type="number"
          step="any"
          defaultValue={textOf(value)}
        />
      );
    case "date":
      return (
        <Input id={id} name={name} type="date" defaultValue={textOf(value)} />
      );
    case "checkbox":
      return <Checkbox id={id} name={name} defaultChecked={value === true} />;
    case "select":
      return (
        <SelectRoot name={name} defaultValue={textOf(value)}>
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => {
              return (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              );
            })}
          </SelectContent>
        </SelectRoot>
      );
  }
}

interface ProblemsProps {
  problems: readonly Problem[];
  testId: string;
}

function Problems({ problems, testId }: ProblemsProps): ReactElement {
  return (
    <>
      {problems.map((problem) => {
        return (
          <p
            key={problem.message}
            role="alert"
            data-testid={testId}
            className="text-sm text-destructive"
          >
            {problem.message}
          </p>
        );
      })}
    </>
  );
}

/** What an input shows of a value: text or a number as written, anything else as nothing. */
function textOf(value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "number" ? String(value) : "";
}

/** One field per entry of `fields`, as its input gives it. An empty field is left out, so an action never receives "" for a value nobody gave. */
function payloadOf(fields: readonly Field[], data: FormData): Values {
  return Object.fromEntries(
    fields.flatMap((field): [string, JsonValue][] => {
      if (field.input === "checkbox") {
        return [[field.name, data.has(field.name)]];
      }

      const written = data.get(field.name);

      if (typeof written !== "string" || written === "") {
        return [];
      }

      return [
        [field.name, field.input === "number" ? Number(written) : written],
      ];
    }),
  );
}
