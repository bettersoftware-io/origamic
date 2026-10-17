import { useContext } from "react";

import type { ShellViewModel } from "./createShellViewModel.ts";
import { ShellViewModelContext } from "./ShellViewModelContext.ts";

/** The view model the provider above hands down. Take its hooks out by name: `const { useUser } = useShellViewModel()`. */
export function useShellViewModel(): ShellViewModel {
  const viewModel = useContext(ShellViewModelContext);

  if (viewModel === null) {
    throw new Error(
      "useShellViewModel needs a <ShellViewModelProvider> above it in the tree",
    );
  }

  return viewModel;
}
