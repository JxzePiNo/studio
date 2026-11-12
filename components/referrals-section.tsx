"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Send, UserPlus } from "lucide-react";
import { referralRequest } from "@/lib/referral-client";
import type { ReferralOverview } from "@/lib/referrals";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import styles from "./referrals.module.css";

export function ReferralsSection() {
  const [data, setData] = useState<ReferralOverview | null>(null);
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState("");
  const [text, setText] = useState("Ciao, benvenuto su Studio! Buono studio e a presto!");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const value = await referralRequest<ReferralOverview>(undefined, signal); if (!signal?.aborted) { setData(value); setError(""); } }
    catch (cause) { if (!signal?.aborted) setError((cause as Error).message); }
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    const abort = new AbortController();
    void load(abort.signal);
    const refresh = () => { if (document.visibilityState === "visible") void load(abort.signal); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { abort.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  async function submit(action: "create" | "greet") {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await referralRequest(action === "create" ? { action, label: label.trim() } : { action, recipientId: selected, text: text.trim() });
      if (action === "create") { setLabel(""); setNotice("Link di invito creato."); }
      else { setSelected(""); setNotice("Saluto inviato. Tony lo consegnerà al prossimo accesso."); }
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.section} aria-label="Inviti e saluti">
    <header className={styles.header}><span><UserPlus size={23} /></span><div><h1>Inviti e saluti</h1><p>Porta i tuoi amici su Studio. Al benvenuto ci pensa Tony.</p></div></header>
    {error && <p role="alert">{error} <Button variant="ghost" size="sm" onClick={() => void load()}>Riprova</Button></p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Carico i tuoi inviti…</p>}
    {data && !data.available && <div className={styles.card}><h2>Invita con il tuo account</h2><p>I link personali e i saluti sono disponibili nello spazio online con accesso Google. Nello spazio locale non vengono registrate altre persone.</p></div>}
    {data?.available && <>
      <div className={styles.card}><h2>I tuoi link</h2><p>Chi apre un link e accede comparirà qui. Vengono mostrati nome e data di ingresso.</p>
        <form className={styles.create} onSubmit={event => { event.preventDefault(); void submit("create"); }}><div><label htmlFor="referral-label">Nome del link</label><Input id="referral-label" value={label} onChange={event => setLabel(event.target.value)} maxLength={60} placeholder="Es. Compagni di corso" disabled={busy} required /></div><Button type="submit" disabled={busy || !label.trim() || data.links.length >= 20}>Crea link</Button></form>
        {!data.links.length && <p>Non hai ancora creato un link.</p>}
        <ul className={styles.list}>{data.links.map(link => {
          const url = `${origin}/?ref=${link.code}`;
          return <li key={link.code}><div className={styles.row}><strong>{link.label}</strong><span>{link.count} {link.count === 1 ? "persona entrata" : "persone entrate"}</span></div><div className={styles.copy}><Input readOnly aria-label={`Link ${link.label}`} value={url} onFocus={event => event.currentTarget.select()} /><Button variant="outline" aria-label={`Copia link ${link.label}`} onClick={() => { void navigator.clipboard?.writeText(url).then(() => setNotice("Link copiato."), () => setNotice("Seleziona e copia il link dal campo.")); if (!navigator.clipboard) setNotice("Seleziona e copia il link dal campo."); }}><Copy size={15} /> Copia</Button></div></li>;
        })}</ul>
      </div>
      <div className={styles.card}><h2>Chi è entrato con i tuoi link <small>({data.invitees.length})</small></h2><p>Puoi inviare un saluto personale a ciascuna persona. Rimarrà in attesa finché Tony non avrà avuto il tempo di mostrarlo.</p>
        {!data.invitees.length && <p>Ancora nessun ingresso. Condividi un link per iniziare.</p>}
        <ul className={styles.list}>{data.invitees.map(person => <li key={person.id}>
          <div className={styles.row}><div><strong>{person.name}</strong><p>{person.linkLabel} · {new Date(person.joinedAt).toLocaleDateString("it-IT")}</p></div>{person.greeting ? <span>{person.greeting.readAt ? "Letto" : "Da leggere"}</span> : <Button variant="outline" size="sm" disabled={busy} onClick={() => { setSelected(person.id); setText("Ciao, benvenuto su Studio! Buono studio e a presto!"); }}><Send size={14} /> Manda un saluto</Button>}</div>
          {person.greeting && <p className={styles.sent}>{person.greeting.text}</p>}
          {selected === person.id && !person.greeting && <form className={styles.compose} onSubmit={event => { event.preventDefault(); void submit("greet"); }}><label htmlFor="referral-greeting">Il tuo saluto per {person.name}</label><Textarea id="referral-greeting" value={text} onChange={event => setText(event.target.value)} maxLength={280} rows={3} disabled={busy} required /><div className={styles.actions}><Button type="submit" disabled={busy || !text.trim()}>Invia saluto</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setSelected("")}>Annulla</Button><small>{text.length}/280</small></div></form>}
        </li>)}</ul>
      </div>
    </>}
  </section>;
}
