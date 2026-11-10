"use client";

import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      default: "ui-button-default",
      outline: "ui-button-outline",
      ghost: "ui-button-ghost",
      destructive: "ui-button-destructive",
      secondary: "ui-button-secondary",
    },
    size: {
      default: "ui-button-size-default",
      sm: "ui-button-size-sm",
      icon: "ui-button-size-icon",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant = "default", size = "default", asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" data-variant={variant} data-size={size} className={buttonVariants({ variant, size, className })} {...(!asChild ? { type } : {})} {...props} />;
}
