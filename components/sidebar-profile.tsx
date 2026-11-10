"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, LogOut, Moon, Pencil, UserRound, X } from "lucide-react";
import { useTheme } from "./theme-provider";
import { browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { useStudyProfile } from "./study-profile-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

function ProfileAvatar({ user, displayName, large = false }: { user: User | null; displayName?: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user?.photoURL]);
  const initials = user || displayName
    ? (displayName || user?.displayName || user?.email || "IO").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase()
    : "IO";
  return <span className={`sidebar-profile-avatar${large ? " is-large" : ""}`} aria-hidden="true">
    {user?.photoURL && !failed
      ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      : initials}
  </span>;
}

export function SidebarProfile() {
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const { profile, loading, saveProfile } = useStudyProfile();
  const [studyProgram, setStudyProgram] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState(false);
  const saveLock = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingAccount = useRef(false);

  function changeAccountOpen(open: boolean) {
    if (open) {
      setStudyProgram(profile?.studyProgram || "");
      setDisplayName(profile?.displayName ?? user?.displayName ?? "");
      setSaveStatus("");
      setSaveError(false);
      setEditingName(false);
    }
    setAccountOpen(open);
  }

  async function saveStudyProgram() {
    if (saveLock.current || loading) return;
    saveLock.current = true; setSaving(true); setSaveStatus(""); setSaveError(false);
    try { await saveProfile(studyProgram, undefined, displayName); setSaveStatus("Profilo salvato."); setEditingName(false); if (!studyProgram.trim()) setAccountOpen(false); }
    catch (cause) { setSaveError(true); setSaveStatus(cause instanceof Error ? cause.message : "Salvataggio non riuscito. Riprova."); }
    finally { saveLock.current = false; setSaving(false); }
  }

  useEffect(() => {
    if (!firebaseEnabled) return;
    return onAuthStateChanged(browserAuth(), setUser);
  }, []);

  const name = profile?.displayName || user?.displayName || user?.email || (firebaseEnabled ? "Il tuo account" : "Spazio locale");
  const detail = user?.email || (firebaseEnabled ? "Account Google" : "Su questo computer");

  return <Dialog.Root open={accountOpen} onOpenChange={changeAccountOpen}>
    <div className="sidebar-profile">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button ref={trigger} className="sidebar-profile-trigger" aria-label="Apri menu account">
            <ProfileAvatar user={user} displayName={profile?.displayName} />
            <span className="sidebar-profile-copy"><strong>{name}</strong><small>{detail}</small></span>
            <ChevronsUpDown size={16} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="profile-menu-content" side="top" align="start" sideOffset={8} collisionPadding={12} onCloseAutoFocus={event => {
            if (openingAccount.current) { event.preventDefault(); openingAccount.current = false; }
          }}>
            <DropdownMenu.Label className="profile-menu-label"><strong>{name}</strong><span>{detail}</span></DropdownMenu.Label>
            <DropdownMenu.Separator className="profile-menu-separator" />
            <DropdownMenu.Item className="profile-menu-item" onSelect={() => { openingAccount.current = true; changeAccountOpen(true); }}><UserRound size={16} aria-hidden="true" /> Account</DropdownMenu.Item>
            <DropdownMenu.Item className="profile-menu-item" onSelect={() => window.dispatchEvent(new Event("studio-help"))}><img className="help-lifebuoy" src="/lifebuoy.png" width={20} height={20} alt="" /> Aiuto e guide</DropdownMenu.Item>
            <DropdownMenu.CheckboxItem className="profile-menu-item" checked={theme === "dark"} onCheckedChange={checked => setTheme(checked ? "dark" : "light")}><Moon size={16} aria-hidden="true" /> Modalità notte <span className="theme-toggle-state" aria-hidden="true">{theme === "dark" ? "Attiva" : "Spenta"}</span></DropdownMenu.CheckboxItem>
            {firebaseEnabled && user && <>
              <DropdownMenu.Separator className="profile-menu-separator" />
              <DropdownMenu.Item className="profile-menu-item profile-menu-signout" onSelect={() => window.dispatchEvent(new Event("margine-signout"))}><LogOut size={16} aria-hidden="true" /> Esci</DropdownMenu.Item>
            </>}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
    <Dialog.Portal>
      <Dialog.Overlay className="account-profile-overlay" />
      <Dialog.Content className="account-profile-dialog" onCloseAutoFocus={event => {
        // The opening menu item has unmounted; restore focus to its trigger.
        event.preventDefault();
        trigger.current?.focus();
      }}>
        <Dialog.Close className="account-profile-close icon-button" aria-label="Chiudi account"><X size={18} /></Dialog.Close>
        <Dialog.Title className="account-profile-a11y">Il tuo account</Dialog.Title>
        <Dialog.Description className="account-profile-a11y">Modifica il tuo nome e il percorso di studio.</Dialog.Description>
        <form className="study-profile-form account-profile-form" onSubmit={event => { event.preventDefault(); void saveStudyProgram(); }}>
          <div className="account-profile-header">
            <ProfileAvatar user={user} displayName={displayName} large />
            <div className="account-profile-identity">
              <p className="account-profile-email">{detail}</p>
              <div className="account-profile-name-row">
                {editingName ? <div className="form-field"><label className="form-field-label" htmlFor="account-display-name">Nome e cognome</label><Input id="account-display-name" aria-label="Nome e cognome" value={displayName} onChange={event => { setDisplayName(event.target.value); setSaveStatus(""); }} maxLength={80} placeholder="Nome e cognome" disabled={loading || saving} autoFocus onFocus={event => event.currentTarget.select()} /></div> : <>
                  <span className="account-profile-name">{displayName || "Nome e cognome"}</span>
                  <button type="button" className="account-profile-edit-name" aria-label="Modifica nome e cognome" disabled={loading || saving} onClick={() => setEditingName(true)}><Pencil size={15} aria-hidden="true" /></button>
                </>}
              </div>
            </div>
          </div>
          <div className="form-field"><label className="form-field-label" htmlFor="account-study-program">Titolo o percorso di studio</label>
          <Input id="account-study-program" aria-label="Titolo o percorso di studio" value={studyProgram} onChange={event => { setStudyProgram(event.target.value); setSaveStatus(""); }} maxLength={300} placeholder="Es. Laurea magistrale in Ingegneria informatica" disabled={loading || saving} />
          <p className="study-profile-form-hint">Il tutor usa questa informazione per adattare spiegazioni e risposte al tuo percorso. Puoi anche lasciare il campo vuoto.</p></div>
          <Button type="submit" disabled={loading || saving}>{saving ? "Salvataggio…" : "Salva profilo"}</Button>
          {saveStatus && <p className="profile-save-status" role={saveError ? "alert" : "status"}>{saveStatus}</p>}
        </form>
        <Dialog.Close className="secondary-button">Chiudi</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
