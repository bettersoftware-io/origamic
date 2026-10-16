import { z } from "zod";

import { defineComponent } from "../defineComponent.ts";
import { fixed, state } from "../props.ts";

export const Select = defineComponent({
  name: "Select",
  description:
    "Choose one of a few options. Emits the chosen value, or null for the empty choice.",
  props: {
    label: fixed(
      z
        .string()
        .min(1, "a Select's label is not empty")
        .describe("What is chosen, shown above the Select."),
    ),
    options: fixed(
      z
        .array(z.string().min(1, "an option is not empty"))
        .min(1, "a Select offers at least one option")
        .describe("The values to choose from, each shown as written."),
    ),
    emptyLabel: fixed(
      z
        .string()
        .min(1)
        .describe(
          "The label of the empty choice, which emits null. Without it there is no empty choice.",
        ),
    ).optional(),
    value: state(
      z
        .string()
        .nullable()
        .describe("The chosen value, or null for the empty choice."),
    ),
  },
  events: { change: ["value"] },
});
