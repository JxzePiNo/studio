import type { ComponentProps } from "react";
import { clsx } from "clsx";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={clsx("ui-card", className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={clsx("ui-card-header", className)} {...props} />;
}
export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 data-slot="card-title" className={clsx("ui-card-title", className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="card-description" className={clsx("ui-card-description", className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={clsx("ui-card-content", className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-footer" className={clsx("ui-card-footer", className)} {...props} />;
}
