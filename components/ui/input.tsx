import type { ComponentProps } from "react";
import { clsx } from "clsx";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input data-slot="input" type={type} className={clsx("ui-input", className)} {...props} />;
}
