/**
 * The test id of an element of a UI spec: `spec.` and the element's id (the
 * plan's decision 6). A part of the element (a row, a field) adds `.<part>`
 * to it, as the catalog's `partTestId` does. `apps/web`'s test ids follow the
 * same rule, for the end-to-end tests.
 */
export function elementTestId(elementId: string): string {
  return `spec.${elementId}`;
}
