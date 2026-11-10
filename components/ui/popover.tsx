"use client";

import type { ComponentProps } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { clsx } from "clsx";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({ className, align = "center", sideOffset = 6, collisionPadding = 12, ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return <PopoverPrimitive.Portal><PopoverPrimitive.Content data-slot="popover-content" className={clsx("ui-popover-content", className)} align={align} sideOffset={sideOffset} collisionPadding={collisionPadding} {...props} /></PopoverPrimitive.Portal>;
}
