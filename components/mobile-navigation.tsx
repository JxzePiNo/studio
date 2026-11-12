"use client";
import { House, Clock3, UserPlus } from "lucide-react";
import { SidebarProfile } from "./sidebar-profile";

export function MobileNavigation({ section, home, sessions, referrals, disabled }: { section: "study" | "sessions" | "referrals"; home: () => void; sessions: () => void; referrals: () => void; disabled?: boolean }) {
  return <nav className="mobile-bottom-navigation" aria-label="Navigazione principale">
    <button type="button" aria-current={section === "study" ? "page" : undefined} disabled={disabled} onClick={home}><House size={20} /><span>Home</span></button>
    <button type="button" aria-current={section === "sessions" ? "page" : undefined} disabled={disabled} onClick={sessions}><Clock3 size={20} /><span>Sessioni</span></button>
    <button type="button" aria-current={section === "referrals" ? "page" : undefined} disabled={disabled} onClick={referrals}><UserPlus size={20} /><span>Inviti</span></button>
    <SidebarProfile mobile />
  </nav>;
}
