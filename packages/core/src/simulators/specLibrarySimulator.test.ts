import { describeSpecLibraryPortContract } from "#/ports/__contracts__/SpecLibraryPortContract.ts";

import { createSpecLibrarySimulator } from "./specLibrarySimulator.ts";

describeSpecLibraryPortContract("the spec library simulator", () => {
  return Promise.resolve(createSpecLibrarySimulator());
});
