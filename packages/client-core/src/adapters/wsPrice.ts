import { filter, map, type Observable } from "rxjs";

import type { Price, PricePort } from "@origamic/domain";
import { decodePrice, parseServerMessage } from "@origamic/shared";

import type { WsConnection } from "./wsConnection.ts";

/**
 * The real PricePort: prices from a server. This is where the wire format is
 * turned into domain terms; nothing past this adapter sees a wire message.
 * A message the protocol does not know is dropped.
 */
export function createWsPricePort(connection: WsConnection): PricePort {
  return {
    prices: (): Observable<Price> => {
      return connection.messages().pipe(
        map(parseServerMessage),
        filter((message) => {
          return message !== undefined;
        }),
        map((message) => {
          return decodePrice(message.payload);
        }),
      );
    },
  };
}
