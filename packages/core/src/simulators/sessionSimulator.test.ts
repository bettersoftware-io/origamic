import { describeSessionPortContract } from "#/ports/__contracts__/SessionPortContract.ts";

import { createSessionSimulator } from "./sessionSimulator.ts";

describeSessionPortContract("the session simulator", (initial) => {
  return Promise.resolve(createSessionSimulator(initial.accounts));
});
