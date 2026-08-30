"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-brand text-white hover:bg-[#155cbc]",
        outline:
          "border border-line bg-surface text-ink hover:bg-hover",
        ghost: "text-ink hover:bg-subtle",
        danger: "bg-danger text-white hover:bg-[#bd3a3a]",
        dangerOutline:
          "border border-line bg-surface text-danger hover:bg-[#fdf2f2] hover:border-[#f0c5c5]",
        link: "text-brand underline-offset-2 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5 text-[12px]",
        lg: "h-10 px-4",
        icon: "h-9 w-9",
        iconSm: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
