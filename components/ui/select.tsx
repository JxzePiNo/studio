"use client";

import type { ComponentProps } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { clsx } from "clsx";

export function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root {...props} />;
}
export function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}
export function SelectGroup({ className, ...props }: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" className={clsx("ui-select-group", className)} {...props} />;
}
export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" className={clsx("ui-select-trigger", className)} {...props}>
    {children}
    <SelectPrimitive.Icon asChild><ChevronDown size={16} aria-hidden="true" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}
export function SelectContent({ className, children, position = "popper", sideOffset = 6, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Content data-slot="select-content" className={clsx("ui-select-content", className)} position={position} sideOffset={sideOffset} collisionPadding={8} {...props}>
      <SelectPrimitive.ScrollUpButton className="ui-select-scroll-button"><ChevronUp size={16} aria-hidden="true" /></SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="ui-select-viewport">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="ui-select-scroll-button"><ChevronDown size={16} aria-hidden="true" /></SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
}
export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={clsx("ui-select-item", className)} {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="ui-select-item-indicator"><SelectPrimitive.ItemIndicator><Check size={16} aria-hidden="true" /></SelectPrimitive.ItemIndicator></span>
  </SelectPrimitive.Item>;
}
export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label data-slot="select-label" className={clsx("ui-select-label", className)} {...props} />;
}
export function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={clsx("ui-select-separator", className)} {...props} />;
}
