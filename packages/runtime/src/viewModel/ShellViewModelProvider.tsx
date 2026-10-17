import type { ReactElement, ReactNode } from "react";

import type { ShellViewModel } from "./createShellViewModel.ts";
import { ShellViewModelContext } from "./ShellViewModelContext.ts";

/** Hands the view model to the tree. Only the composition root and test harnesses render it; a component reads it with `useShellViewModel`. */
export function ShellViewModelProvider({
  viewModel,
  children,
}: ShellViewModelProviderProps): ReactElement {
  return (
    <ShellViewModelContext.Provider value={viewModel}>
      {children}
    </ShellViewModelContext.Provider>
  );
}

interface ShellViewModelProviderProps {
  viewModel: ShellViewModel;
  children: ReactNode;
}
