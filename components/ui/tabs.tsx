"use client";

import type { ComponentProps } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { clsx } from "clsx";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={clsx("ui-tabs", className)} {...props} />;
}
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={clsx("ui-tabs-list", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={clsx("ui-tabs-trigger", className)} {...props} />;
}
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={clsx("ui-tabs-content", className)} {...props} />;
}
