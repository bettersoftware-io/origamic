// shadcn's label (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/label.json.
import { cn } from "cn";
import { Label as LabelPrimitive } from "radix-ui";
import type { ComponentProps, ReactElement } from "react";

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>): ReactElement {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
