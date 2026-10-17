// Part of shadcn's select (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/select.json.
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps, ReactElement } from "react";

export function SelectValue({
  ...props
}: ComponentProps<typeof SelectPrimitive.Value>): ReactElement {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}
