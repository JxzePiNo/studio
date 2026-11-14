"use client";
import { useState } from "react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { Ban, Flag, MoreHorizontal, UserMinus, X } from "lucide-react";
import type { FriendPerson } from "@/lib/friends-types";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import styles from "./friends.module.css";

export function FriendActions({ person, friend = false, busy, onAction }: { person: FriendPerson; friend?: boolean; busy: boolean; onAction: (body: unknown, message: string) => Promise<boolean | undefined> }) {
  const [action, setAction] = useState<"remove" | "report" | "block" | null>(null);
  const [reason, setReason] = useState("spam"), [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const title = action === "remove" ? "Rimuovi amico" : action === "block" ? "Blocca utente" : "Segnala utente";
  return <><Dropdown.Root><Dropdown.Trigger asChild><Button variant="ghost" size="sm" disabled={busy} aria-label={`Azioni per ${person.name}`}><MoreHorizontal size={18} /></Button></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="profile-menu-content" align="end" sideOffset={6} collisionPadding={12}>
    {friend && <Dropdown.Item className="profile-menu-item" onSelect={() => setAction("remove")}><UserMinus size={16} /> Rimuovi amico</Dropdown.Item>}
    <Dropdown.Item className="profile-menu-item" onSelect={() => setAction("report")}><Flag size={16} /> Segnala utente</Dropdown.Item>
    <Dropdown.Item className="profile-menu-item" onSelect={() => setAction("block")}><Ban size={16} /> Blocca utente</Dropdown.Item>
  </Dropdown.Content></Dropdown.Portal></Dropdown.Root>
    <Dialog.Root open={!!action} onOpenChange={open => { if (!open && !busy) setAction(null); }}><Dialog.Portal><Dialog.Overlay className="account-profile-overlay" /><Dialog.Content className="account-profile-dialog">
      <Dialog.Close className="account-profile-close icon-button" disabled={busy} aria-label="Chiudi azione utente"><X size={18} /></Dialog.Close><Dialog.Title>{title}</Dialog.Title>
      <Dialog.Description>{action === "remove" ? `Vuoi rimuovere ${person.name} dai tuoi amici?` : action === "block" ? `Tu e ${person.name} non comparirete più nelle rispettive ricerche e attività. L’amicizia e le richieste saranno rimosse. Puoi sbloccarlo dalle impostazioni Amici.` : `Indica perché vuoi segnalare ${person.name}. La segnalazione è riservata.`}</Dialog.Description>
      <form className={styles.profileForm} onSubmit={async event => {
        event.preventDefault();
        const body = action === "remove" ? { action: "relationship", targetId: person.id, operation: "remove" } : action === "block" ? { action: "block", targetId: person.id, blocked: true } : { action: "report", targetId: person.id, reason, details };
        const message = action === "remove" ? "Amicizia rimossa." : action === "block" ? "Utente bloccato." : "Segnalazione inviata.";
        setError("");
        if (await onAction(body, message)) { setAction(null); setDetails(""); }
        else setError("Operazione non riuscita. Riprova.");
      }}>
        {action === "report" && <><label>Motivo<Select value={reason} onValueChange={setReason} disabled={busy}><SelectTrigger aria-label="Motivo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="spam">Spam</SelectItem><SelectItem value="harassment">Molestie o comportamenti offensivi</SelectItem><SelectItem value="inappropriate">Contenuti inappropriati</SelectItem><SelectItem value="other">Altro</SelectItem></SelectContent></Select></label><label>Dettagli (facoltativi)<textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={1000} rows={3} disabled={busy} /></label></>}
        {error && <p role="alert">{error}</p>}<div className={styles.actions}><Button type="button" variant="outline" disabled={busy} onClick={() => setAction(null)}>Annulla</Button><Button type="submit" disabled={busy}>{busy ? "Salvataggio…" : title}</Button></div>
      </form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </>;
}
