"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex items-stretch gap-5 border-b border-line px-4",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

/** Tab styled after the reference: label + counter, 2px bottom indicator */
const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    count?: number;
  }
>(({ className, children, count, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative -mb-px flex h-10 items-center gap-2 border-b-2 border-transparent text-[13px] font-medium text-ink-muted transition-colors",
      "hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink",
      className,
    )}
    {...props}
  >
    {children}
    {count !== undefined && (
      <span className="tnum rounded-[3px] bg-subtle px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">
        {count}
      </span>
    )}
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = TabsPrimitive.Content;

export { Tabs, TabsList, TabsTrigger, TabsContent };
