/**
 * An element's test id is `spec.<element id>` (the runtime gives it). A part
 * of an element adds `.<part>` to it: `spec.table.row.<row id>`,
 * `spec.editForm.field.title`.
 */
export function partTestId(testId: string, part: string): string {
  return `${testId}.${part}`;
}

/** The parts of an element that carry a test id of their own. */
export const PARTS = {
  /** A Select's button, which opens its options. */
  trigger: "trigger",
  /** A Table's row, followed by the row's id. */
  row: "row",
  /** A Form's field, followed by the field's name. */
  field: "field",
  /** A Form's button. */
  submit: "submit",
  /** What an edit Form says while it has nothing to edit. */
  notice: "notice",
  /** A problem, beside the field it is about or at the top of the Form. */
  problem: "problem",
} as const;
