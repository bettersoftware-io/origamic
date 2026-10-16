import { z } from "zod";

import { PropName } from "@origamic/spec";

import { defineComponent } from "../defineComponent.ts";
import { fixed, state, view } from "../props.ts";

const Column = z.strictObject({
  property: PropName.describe("The property of the rows' type it shows."),
  label: z
    .string()
    .min(1, "a column's label is not empty")
    .describe("The column's heading."),
});

export const Table = defineComponent({
  name: "Table",
  description:
    "The rows of a view, one column per property named in `columns`. Clicking a row emits its id and its values; the row whose id `selected` holds is marked.",
  props: {
    rows: view(),
    columns: fixed(
      z
        .array(Column)
        .min(1, "a Table shows at least one column")
        .describe("The columns, in order: one per property shown."),
    ),
    selected: state(
      z
        .string()
        .min(1)
        .nullable()
        .describe("The id of the row to mark as selected, or null for none."),
    ).optional(),
  },
  events: { select: ["id", "values"] },
});
