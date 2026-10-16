// shadcn's button (new-york-v4), from https://ui.shadcn.com/r/styles/new-york-v4/button.json.
// Only its default variant and size are used, so it takes neither, nor
// `asChild` (ADR-0010: what is copied is what a catalog entry uses).
import { cva } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps, ReactElement } from "react";

export function Button({
  className,
  ...props
}: ComponentProps<"button">): ReactElement {
  return (
    <button
      data-slot="button"
      data-variant="default"
      data-size="default"
      className={cn(buttonVariants({ className }))}
      {...props}
    />
  );
}

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
