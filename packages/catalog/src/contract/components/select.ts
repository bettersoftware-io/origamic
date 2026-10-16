import { z } from "zod";

import { defineComponent } from "../defineComponent.ts";
import { fixed, state } from "../props.ts";

export const Select = defineComponent({
  name: "Select",
  description:
    "Choose one of a few options. Emits the chosen value, or null for the empty choice.",
  props: {
    label: fixed(z.string().min(1, "a Select's label is not empty")),
    options: fixed(
      z
        .array(z.string().min(1, "an option is not empty"))
        .min(1, "a Select offers at least one option"),
    ),
    /** The label of the empty choice, which emits null. Without it there is no empty choice. */
    emptyLabel: fixed(z.string().min(1)).optional(),
    value: state(z.string().nullable()),
  },
  events: { change: ["value"] },
});
