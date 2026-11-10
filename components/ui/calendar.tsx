"use client";

import type { ComponentProps } from "react";
import { DayPicker } from "react-day-picker";
import { it } from "react-day-picker/locale";
import { clsx } from "clsx";

export function Calendar({ className, showOutsideDays = true, locale = it, ...props }: ComponentProps<typeof DayPicker>) {
  return <DayPicker data-slot="calendar" className={clsx("ui-calendar", className)} showOutsideDays={showOutsideDays} locale={locale} {...props} />;
}
