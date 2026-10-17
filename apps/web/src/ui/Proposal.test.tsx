import { describe, expect, it } from "vitest";

import { mountProposal } from "./Proposal.page.tsx";

describe("a proposal", () => {
  it("shows what the model says, the change set's lines and the app's diff", () => {
    const page = mountProposal();

    expect(page.explanation()).toBe("A date finished on Book.");
    expect(page.changes()).toEqual(["Book: add dateFinished (date, optional)"]);
    expect(page.diff()).toEqual([
      "+ element editForm",
      "− binding updateBook@1",
      "~ binding Book@1 → Book@2",
    ]);
  });

  it("says the ontology does not change when the change set has no line", () => {
    const page = mountProposal({ changes: [] });

    expect(page.changes()).toEqual([]);
    expect(page.noChange()).toBe("No change.");
  });

  it("hands Accept and Reject to whoever holds the proposal", async () => {
    const page = mountProposal();

    await page.accept();
    await page.reject();

    expect(page.answers()).toEqual({ accepted: 1, rejected: 1 });
  });
});
