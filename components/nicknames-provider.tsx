"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { defaultNicknames, userNickname } from "@/lib/user-nickname";

const NicknamesContext = createContext({ entries: defaultNicknames, update: (_entries: Record<string, string>) => {} });

export function NicknamesProvider({ children }: { children: ReactNode }) {
  const [entries, update] = useState<Readonly<Record<string, string>>>(defaultNicknames);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/nicknames", { headers: await authHeaders() });
        const result = await readApiResponse<Record<string, string>>(response);
        if (active) update(result);
      } catch { /* The built-in catalogue remains available offline. */ }
    })();
    return () => { active = false; };
  }, []);
  return <NicknamesContext.Provider value={{ entries, update }}>{children}</NicknamesContext.Provider>;
}

export const useNicknames = () => useContext(NicknamesContext);
export function useNickname(name: string | null | undefined) {
  return userNickname(name, useNicknames().entries);
}
