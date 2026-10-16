import { z } from "zod";

import { defineComponent } from "../defineComponent.ts";
import { fixed } from "../props.ts";

export const Stack = defineComponent({
  name: "Stack",
  description:
    "Lays out its children one under the other, in the order of `children`. The only component that shows children.",
  showsChildren: true,
  props: {
    gap: fixed(
      z
        .enum(["small", "medium", "large"])
        .describe("The space between the children; medium when left out."),
    ).optional(),
  },
  events: {},
});
