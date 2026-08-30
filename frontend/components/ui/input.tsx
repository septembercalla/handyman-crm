import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-9 w-full rounded-[4px] border border-line bg-surface px-2.5 text-[13px] text-ink",
        "placeholder:text-ink-muted/70",
        "focus:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
        "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted",
        "aria-[invalid=true]:border-danger",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
