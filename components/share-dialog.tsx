"use client";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Globe2, LockKeyhole, Search, Share2, Users, X } from "lucide-react";
import { friendsRequest } from "@/lib/friends-client";
import { sharingChanged, sharingRequest } from "@/lib/sharing-client";
import type { FriendsOverview, FriendPerson } from "@/lib/friends-types";
import type { ShareTarget, SharingOverview } from "@/lib/sharing-types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import styles from "./sharing.module.css";

export function ShareDialog({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const [friends, setFriends] = useState<FriendPerson[]>([]);
  const [data, setData] = useState<SharingOverview | null>(null);
  const [visibility, setVisibility] = useState<"direct" | "public">("direct");
  const [coauthor, setCoauthor] = useState(false);
  const [includeChat, setIncludeChat] = useState(false);
  const [includeResults, setIncludeResults] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const [workspace, setWorkspace] = useState<{ owner: boolean; members: { id: string; name: string }[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([sharingRequest<SharingOverview>(undefined, controller.signal), friendsRequest<FriendsOverview>("?period=day", undefined, controller.signal)]).then(([shares, people]) => { if (!controller.signal.aborted) { setData(shares); setFriends(people.friends); } }).catch(cause => { if (!controller.signal.aborted) setError((cause as Error).message); });
    if (target.kind === "course") void sharingRequest<{ owner: boolean; members: { id: string; name: string }[] }>(undefined, controller.signal, `?workspace=${target.id}`).then(value => { if (!controller.signal.aborted) setWorkspace(value); }).catch(() => {});
    return () => controller.abort();
  }, [target.id, target.kind]);
  const activePublic = data?.sent.find(share => share.sourceId === target.id && share.visibility === "public");
  const filtered = friends.filter(person => `${person.name} ${person.nickname}`.toLowerCase().includes(search.toLowerCase()));
  async function submit(body?: unknown) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await sharingRequest(body || { action: "create", kind: target.kind, sourceId: target.id, ...(target.documentId ? { documentId: target.documentId } : {}), visibility, mode: coauthor && visibility === "direct" ? "coauthor" : "copy", recipientIds: visibility === "direct" ? selected : [], includeChat: visibility === "direct" && includeChat, includeResults: visibility === "direct" && includeResults });
      if ((body as { action?: string } | undefined)?.action === "leave") { sharingChanged(); window.dispatchEvent(new CustomEvent("studio-open-shared-course", { detail: { folderId: "" } })); onClose(); return; }
      const result = await sharingRequest<SharingOverview>(); setData(result); sharingChanged();
      if (target.kind === "course") try { setWorkspace(await sharingRequest(undefined, undefined, `?workspace=${target.id}`)); } catch {}
      setNotice(body ? "Preferenze aggiornate." : visibility === "public" ? "Corso pubblicato. Chi studia lo stesso corso di laurea può usarlo dalla home." : `Condivisione inviata a ${selected.length} ${selected.length === 1 ? "persona" : "persone"}.`);
      setSelected([]);
    } catch (cause) { setError((cause as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog.Root open onOpenChange={open => { if (!open && !busy) onClose(); }}><Dialog.Portal><Dialog.Overlay className="plan-overlay" /><Dialog.Content className={`plan-dialog ${styles.dialog}`} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}><Dialog.Close asChild><Button variant="ghost" size="icon" className="plan-dialog-close" aria-label="Chiudi condivisione" disabled={busy}><X size={18} /></Button></Dialog.Close><Dialog.Title><Share2 size={21} /> Condividi {target.kind === "course" ? "corso" : target.kind === "quiz" ? "quiz" : "PDF"}</Dialog.Title><Dialog.Description>{target.name}</Dialog.Description>
    {error && <p role="alert" className="plan-error">{error}</p>}{notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!data && !error && <p role="status">Preparo la condivisione…</p>}
    {data && !data.available && <p>Accedi con il tuo account Google nello spazio online per condividere materiali con gli amici.</p>}
    {data?.available && <>
      {workspace && workspace.members.length > 1 && <details className={styles.members}><summary><Users size={16} /> {workspace.members.length} coautori nello spazio</summary><ul>{workspace.members.map(person => <li key={person.id}><span>{person.name}</span>{workspace.owner && person.id !== workspace.members[0]?.id && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void submit({ action: "remove-member", folderId: target.id, memberId: person.id })}>Rimuovi accesso</Button>}</li>)}</ul>{!workspace.owner && <Button variant="outline" disabled={busy} onClick={() => void submit({ action: "leave", folderId: target.id })}>Lascia il corso condiviso</Button>}</details>}
      {(!workspace || workspace.owner) && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}>
        {target.kind === "course" && <fieldset className={styles.visibility}><legend>Chi può usarlo?</legend><label><input type="radio" name="share-visibility" checked={visibility === "direct"} onChange={() => setVisibility("direct")} disabled={busy} /><Users size={18} /><span>Amici scelti<small>Invita più persone insieme</small></span></label><label><input type="radio" name="share-visibility" checked={visibility === "public"} onChange={() => { setVisibility("public"); setCoauthor(false); }} disabled={busy} /><Globe2 size={18} /><span>Pubblico<small>Visibile a chi studia lo stesso corso di laurea</small></span></label></fieldset>}
        {activePublic && <div className={styles.notice}><span><Globe2 size={15} /> Questo corso è pubblico.</span><Button variant="outline" size="sm" disabled={busy} onClick={() => void submit({ action: "revoke", shareId: activePublic.id })}><LockKeyhole size={14} /> Rendi privato</Button><small>Le copie personali già usate restano agli studenti.</small></div>}
        {visibility === "direct" ? <>
          <fieldset className={styles.recipients}><legend>Seleziona gli amici <span>{selected.length}/50</span></legend>{friends.length > 0 && <><label className={styles.friendSearch}><Search size={15} /><Input aria-label="Filtra amici" placeholder="Nome o username" value={search} onChange={event => setSearch(event.target.value)} /></label><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setSelected(selected.length === friends.length ? [] : friends.slice(0, 50).map(person => person.id))}>{selected.length === friends.length ? "Deseleziona tutti" : "Seleziona tutti"}</Button></>}<div className={styles.friendList}>{filtered.map(person => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} disabled={busy || (!selected.includes(person.id) && selected.length >= 50)} onChange={event => setSelected(previous => event.target.checked ? [...previous, person.id] : previous.filter(id => id !== person.id))} /><span><strong>{person.name}</strong><small>{person.nickname ? `@${person.nickname}` : person.university}</small></span>{selected.includes(person.id) && <Check size={15} />}</label>)}</div>{!friends.length && <p>Aggiungi e accetta amicizie nella sezione Amici per condividere direttamente.</p>}</fieldset>
          {target.kind === "course" && <label className={styles.option}><input type="checkbox" checked={coauthor} disabled={busy} onChange={event => setCoauthor(event.target.checked)} /><span><strong>Invita come coautori</strong><small>Un solo spazio: stessi file, chat, mappe e nuovi caricamenti. I risultati dei quiz restano personali finché vengono condivisi.</small></span></label>}
          <label className={styles.option}><input type="checkbox" checked={includeChat} disabled={busy} onChange={event => setIncludeChat(event.target.checked)} /><span><strong>Includi la cronologia delle chat</strong><small>{coauthor ? "Se disattivato, i nuovi coautori vedono le analisi e le conversazioni aggiunte dopo il loro ingresso." : "Include domande, risposte e mappe già create. Le analisi sono sempre incluse."}</small></span></label>
          <label className={styles.option}><input type="checkbox" checked={includeResults} disabled={busy || coauthor} onChange={event => setIncludeResults(event.target.checked)} /><span><strong>Condividi le mie risposte e i punteggi dei quiz</strong><small>{coauthor ? "Nei corsi con coautori scegli cosa pubblicare al termine di ogni quiz." : "I destinatari potranno vederli solo dopo aver completato il quiz."}</small></span></label>
        </> : <div className={styles.publicNote}><Globe2 size={22} /><div><strong>Un punto di partenza pulito.</strong><p>Chi usa il corso riceve una copia personale con PDF, quiz e analisi. Chat personali, note, risposte date e progressi sono esclusi. I PDF originali non vengono duplicati.</p><p>La provenienza universitaria dei file resta quella del caricamento.</p></div></div>}
        <div className="plan-form-actions"><Button type="submit" disabled={busy || (visibility === "direct" && !selected.length)}><Share2 size={16} />{busy ? "Preparazione…" : visibility === "public" ? activePublic ? "Aggiorna versione pubblica" : "Pubblica corso" : coauthor ? "Invita coautori" : "Condividi"}</Button></div>
      </form>}
    </>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
