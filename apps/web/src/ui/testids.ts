/** Every test id the shell uses, so a test and a component cannot drift apart. The end-to-end tests read them too. */
export const TESTIDS = {
  failure: "shell.failure",
  signIn: "sign-in",
  signInEmail: "sign-in.email",
  signInPassword: "sign-in.password",
  signInSubmit: "sign-in.sign-in",
  signUpSubmit: "sign-in.sign-up",
  signInProblem: "sign-in.problem",
  signingIn: "shell.signing-in",
  signedInAs: "shell.signed-in-as",
  signOut: "shell.sign-out",
  builder: "builder",
  builderTarget: "builder.target",
  builderNewApp: "builder.new-app",
  builderRevise: "builder.revise",
  builderIntent: "builder.intent",
  builderAsk: "builder.ask",
  builderProgress: "builder.progress",
  builderProblem: "builder.problem",
  builderRefused: "builder.refused",
  proposal: "proposal",
  proposalExplanation: "proposal.explanation",
  proposalChange: "proposal.change",
  proposalDiff: "proposal.diff",
  proposalAccept: "proposal.accept",
  proposalReject: "proposal.reject",
  library: "library",
  libraryEntry: "library.entry",
  libraryOpen: "library.open",
  libraryProblem: "library.problem",
  workspace: "workspace",
  workspaceNotice: "workspace.notice",
  panel: "panel",
  panelCaption: "panel-caption",
  panelNotice: "panel-notice",
  compatibilityReport: "compatibility-report",
} as const;

/**
 * The test id of an element of an app's UI spec: `spec.` and the element's
 * id, the rule the runtime gives its elements (the plan's decision 6). A
 * test holds the two equal, so an end-to-end test can find an element of the
 * app without importing the runtime.
 */
export function specElementTestId(elementId: string): string {
  return `spec.${elementId}`;
}

/**
 * The test id of a part of an element (a table's row, a form's field, its
 * button): the element's, then each part after a dot, as the catalog names
 * them: `spec.table.row.<row id>`, `spec.addForm.field.title`,
 * `spec.addForm.submit`.
 */
export function specPartTestId(elementId: string, ...parts: string[]): string {
  return [specElementTestId(elementId), ...parts].join(".");
}

/** The parts of a catalog component that carry a test id of their own, as the catalog names them. */
export const SPEC_PARTS = {
  trigger: "trigger",
  row: "row",
  field: "field",
  submit: "submit",
} as const;

/** The test id of a panel of the workspace, by the panel's id. */
export function panelTestId(panel: string): string {
  return `${TESTIDS.panel}.${panel}`;
}

/** The test id of an app's entry in the library, by the app's id. */
export function libraryEntryTestId(app: string): string {
  return `${TESTIDS.libraryEntry}.${app}`;
}
