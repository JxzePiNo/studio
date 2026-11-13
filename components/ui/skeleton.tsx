import type { ComponentProps } from "react";
import { clsx } from "clsx";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="skeleton" className={clsx("ui-skeleton", className)} {...props} />;
}
