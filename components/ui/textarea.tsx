import type { ComponentProps } from "react";
import { clsx } from "clsx";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={clsx("ui-textarea", className)} {...props} />;
}
