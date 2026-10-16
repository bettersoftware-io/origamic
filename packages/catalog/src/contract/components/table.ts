import { z } from "zod";

import { PropName } from "@origamic/spec";

import { defineComponent } from "../defineComponent.ts";
import { fixed, state, view } from "../props.ts";

const Column = z.strictObject({
  property: PropName,
  label: z.string().min(1, "a column's label is not empty"),
});

export const Table = defineComponent({
  name: "Table",
  description:
    "The rows of a view, one column per property named in `columns`. Clicking a row emits its id and its values; the row whose id `selected` holds is marked.",
  props: {
    rows: view(),
    columns: fixed(z.array(Column).min(1, "a Table shows at least one column")),
    selected: state(z.string().min(1).nullable()).optional(),
  },
  events: { select: ["id", "values"] },
});
