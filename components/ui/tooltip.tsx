"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps, ReactElement } from "react";
import styles from "./tooltip.module.css";

export function ActionTooltip({ label, children, ...props }: Omit<ComponentProps<typeof TooltipPrimitive.Trigger>, "children"> & { label: string; children: ReactElement }) {
  if (!label) return children;
  return <TooltipPrimitive.Provider delayDuration={350}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger {...props} asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className={styles.content} side="bottom" sideOffset={8} collisionPadding={12}>
          {label}<TooltipPrimitive.Arrow className={styles.arrow} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>;
}
