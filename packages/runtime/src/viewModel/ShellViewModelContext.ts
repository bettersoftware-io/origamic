import { createContext } from "react";

import type { ShellViewModel } from "./createShellViewModel.ts";

/** Where the provider puts the shell's view model for the tree below it. */
export const ShellViewModelContext = createContext<ShellViewModel | null>(null);
