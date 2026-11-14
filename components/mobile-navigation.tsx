"use client";
import { House, Clock3, Users, GraduationCap } from "lucide-react";
import { SidebarProfile } from "./sidebar-profile";

export function MobileNavigation({ section, home, exams, sessions, friends, disabled, admin = false, onSignOut }: { section?: "study" | "exams" | "sessions" | "friends"; home: () => void; exams: () => void; sessions: () => void; friends: () => void; disabled?: boolean; admin?: boolean; onSignOut?: () => void }) {
  return <nav className="mobile-bottom-navigation" aria-label="Navigazione principale">
    <button type="button" aria-current={section === "study" ? "page" : undefined} disabled={disabled} onClick={home}><House size={20} /><span>Home</span></button>
    <button type="button" aria-current={section === "exams" ? "page" : undefined} disabled={disabled} onClick={exams}><GraduationCap size={20} /><span>Esami</span></button>
    <button type="button" aria-current={section === "sessions" ? "page" : undefined} disabled={disabled} onClick={sessions}><Clock3 size={20} /><span>Sessioni</span></button>
    <button type="button" aria-current={section === "friends" ? "page" : undefined} disabled={disabled} onClick={friends}><Users size={20} /><span>Amici</span></button>
    <SidebarProfile mobile admin={admin} onSignOut={onSignOut} />
  </nav>;
}
