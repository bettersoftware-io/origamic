// The catalog's React side: what the runtime renders a UI spec with. The
// contracts, the manifest and what the model is held to are the entry
// `@origamic/catalog/manifest`, which imports no React. `Envelope`, what each
// implementation takes, is exported when its first importer (the runtime)
// comes: knip refuses an export nobody imports.
export { implementations } from "./react/implementations.ts";
export { partTestId } from "./react/testIds.ts";
