/** Why something failed, in words a person can read: an error's message, or what was thrown, as text. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The text a form's field holds, by its name; empty when the form has no such field, or it holds a file. */
export function textOf(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);

  return typeof value === "string" ? value : "";
}
