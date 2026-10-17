import { describe, expect, it } from "vitest";

import { messageOf, textOf } from "./forms.ts";

describe("the shell's form helpers", () => {
  it("words a failure by its message, or by what was thrown", () => {
    expect(messageOf(new Error("the gateway could not be reached"))).toBe(
      "the gateway could not be reached",
    );
    expect(messageOf("refused")).toBe("refused");
  });

  it("reads a field's text, and nothing for a field the form does not have", () => {
    const form = createForm(
      '<input name="email" value="reader@origamic.test">',
    );

    expect(textOf(form, "email")).toBe("reader@origamic.test");
    expect(textOf(form, "password")).toBe("");
  });
});

function createForm(fields: string): HTMLFormElement {
  const form = document.createElement("form");

  form.innerHTML = fields;

  return form;
}
