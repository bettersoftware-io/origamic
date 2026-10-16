// Part of shadcn's select (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/select.json.
// The root, which holds the value.
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps, ReactElement } from "react";

export function Select({
  ...props
}: ComponentProps<typeof SelectPrimitive.Root>): ReactElement {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}
