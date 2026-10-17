import { z } from "zod";

import { defineComponent } from "../defineComponent.ts";
import { fixed, state } from "../props.ts";

export const Text = defineComponent({
  name: "Text",
  description:
    "A line or a paragraph of plain text: a heading, a sentence, a value the app keeps.",
  props: {
    text: state(z.string().describe("The text shown.")),
    tone: fixed(
      z
        .enum(["body", "heading", "muted"])
        .describe("How the text is set; body when left out."),
    ).optional(),
  },
  events: {},
});
