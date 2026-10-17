// The interpreter of specs: it renders a UI spec over the catalog and wires
// its views, state and actions to the core. The composition root takes the
// catalog from here, since it may not name the catalog itself.
export { catalog } from "@origamic/catalog/manifest";

export { AppView } from "./AppView.tsx";
export { elementTestId } from "./elementTestId.ts";
export { createShellViewModel } from "./viewModel/createShellViewModel.ts";
