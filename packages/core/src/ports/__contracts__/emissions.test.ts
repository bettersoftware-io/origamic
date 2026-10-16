import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import { collect } from "./emissions.ts";

describe("collect", () => {
  it("waits for each emission in turn", async () => {
    const source = new Subject<number>();
    const seen = collect(source);
    const first = seen.next();

    source.next(1);
    await first;
    source.next(2);
    await seen.next();
    seen.stop();

    expect(seen.emissions).toEqual([1, 2]);
  });

  it("rejects a wait the stream ends before, saying how it ended", async () => {
    const completing = new Subject<number>();
    const failing = new Subject<number>();
    const completed = collect(completing);
    const failed = collect(failing);
    const waitingToComplete = completed.next();
    const waitingToFail = failed.next();

    completing.complete();
    failing.error(new Error("the socket closed"));

    await expect(waitingToComplete).rejects.toThrow(
      "the stream completed after 0 emission(s), and a contract waited for another",
    );
    await expect(waitingToFail).rejects.toThrow(
      "the stream failed after 0 emission(s): Error: the socket closed",
    );
    await expect(completed.next()).rejects.toThrow("completed");
  });
});
