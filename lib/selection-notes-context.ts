"use client";

import { createContext } from "react";

export interface SelectionNote {
  id: string;
  source: string;
  term: string;
  context: string;
  explanation?: string;
}

export const SelectionNotesContext = createContext<{
  notes: SelectionNote[];
  open: (id: string) => void;
} | null>(null);

export function noteSource(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${text.length}-${hash >>> 0}`;
}
