import type { Observable } from "rxjs";

import type { GenerationEvent, GenerationRequest } from "@origamic/spec";

/**
 * The way to the model, which only the gateway calls (ADR-0011). Nothing a
 * generation proposes is stored until the builder accepts it.
 */
export interface LlmGatewayPort {
  /** The generation's events in order: its progress, then one `proposal` or one `failed`, and then it completes. */
  generate(request: GenerationRequest): Observable<GenerationEvent>;
}

/** The port by the name the rest of Origamic uses. The file and the interface carry `Port` for the contract gate. */
export type LlmGateway = LlmGatewayPort;
