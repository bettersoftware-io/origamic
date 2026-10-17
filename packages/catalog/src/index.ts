// The catalog's React side: what the runtime renders a UI spec with. The
// contracts, the manifest and what the model is held to are the entry
// `@origamic/catalog/manifest`, which imports no React.
export type { Envelope } from "./react/envelope.ts";
export { implementations } from "./react/implementations.ts";
export { PARTS, partTestId } from "./react/testIds.ts";
