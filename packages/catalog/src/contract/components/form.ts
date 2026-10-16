import { z } from "zod";

import { Json, PropName } from "@origamic/spec";

import { defineComponent, fieldsOf } from "../defineComponent.ts";
import { fixed, state } from "../props.ts";

const Field = z.strictObject({
  /** The field of the submitted payload, and the property it is meant to set. */
  name: PropName,
  label: z.string().min(1, "a field's label is not empty"),
  input: z.enum(["text", "longText", "number", "select", "date", "checkbox"]),
  /** The choices of a `select` input. */
  options: z.array(z.string().min(1)).min(1).optional(),
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
    fields: fixed(Fields),
    submitLabel: fixed(z.string().min(1, "a Form's button has a label")),
    mode: fixed(z.enum(["create", "edit"])),
    /** What an edit form starts from: an object's values, or null when there is nothing to edit. */
    values: state(z.record(z.string(), Json).nullable()).optional(),
  },
  events: { submit: fieldsOf("fields") },
});
