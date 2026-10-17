import { z } from "zod";

import { Json, PropName } from "@origamic/spec";

import { defineComponent, fieldsOf } from "../defineComponent.ts";
import { fixed, state } from "../props.ts";

const Field = z.strictObject({
  name: PropName.describe(
    "The field of the submitted payload, and the property it is meant to set.",
  ),
  label: z
    .string()
    .min(1, "a field's label is not empty")
    .describe("What the field asks for, shown above it."),
  input: z
    .enum(["text", "longText", "number", "select", "date", "checkbox"])
    .describe(
      "How it is filled in: a number gives a number, a checkbox true or false, a date YYYY-MM-DD, the others text.",
    ),
  options: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe("The choices of a select input, which needs them."),
});

const Fields = z
  .array(Field)
  .min(1, "a Form has at least one field")
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();

    fields.forEach((field, index) => {
      if (seen.has(field.name)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "name"],
          message: `"${field.name}" names two fields of the form`,
        });
      }

      seen.add(field.name);

      if (field.input === "select" && field.options === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [index, "options"],
          message: `the select field "${field.name}" has no options`,
        });
      }
    });
  });

export const Form = defineComponent({
  name: "Form",
  description:
    'Fields to fill in and a button. Submitting emits one field per entry of `fields`, under its name: a number input gives a number, a checkbox true or false, and an empty field is left out. In mode "edit" it shows `values` to change, and "Select a row to edit" while `values` is null.',
  props: {
    fields: fixed(
      Fields.describe("The fields, in order; each name appears once."),
    ),
    submitLabel: fixed(
      z
        .string()
        .min(1, "a Form's button has a label")
        .describe("The label of its button."),
    ),
    mode: fixed(
      z
        .enum(["create", "edit"])
        .describe(
          "create starts empty; edit shows `values`, and waits while they are null.",
        ),
    ),
    values: state(
      z
        .record(z.string(), Json)
        .nullable()
        .describe(
          "What an edit form starts from: an object's values, or null when there is nothing to edit.",
        ),
    ).optional(),
  },
  events: { submit: fieldsOf("fields") },
});
