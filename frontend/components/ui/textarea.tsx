import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[76px] w-full resize-y rounded-[4px] border border-line bg-surface px-2.5 py-2 text-[13px] text-ink",
      "placeholder:text-ink-muted/70",
      "focus:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
      "aria-[invalid=true]:border-danger",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
