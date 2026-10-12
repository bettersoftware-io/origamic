import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Price } from "@origamic/domain";
import { encodePrice } from "@origamic/shared";

import { createWsPricePort } from "./wsPrice.ts";

describe("the WebSocket price adapter", () => {
  it("drops a message the protocol does not know, and keeps delivering", () => {
    const messages$ = new Subject<unknown>();
    const received: Price[] = [];

    createWsPricePort({
      messages: () => {
        return messages$;
      },
    })
      .prices()
      .subscribe((price) => {
        return received.push(price);
      });

    messages$.next({ type: "unknown" });
    messages$.next("not even an object");
    messages$.next(encodePrice({ symbol: "EURUSD", mid: 1.1 }));

    expect(received).toEqual([{ symbol: "EURUSD", mid: 1.1 }]);
  });
});
