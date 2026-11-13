"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Activity, Check, ChevronDown, Eye, Search, Settings2, UserPlus, Users, X } from "lucide-react";
import { friendsChanged, friendsRequest } from "@/lib/friends-client";
import type { FriendPerson, FriendsOverview, FriendsPeriod, SocialSettings } from "@/lib/friends-types";
import { useStudyProfile } from "./study-profile-provider";
import { ReferralsSection } from "./referrals-section";
import * as Popover from "@radix-ui/react-popover";
import { FriendActions } from "./friend-actions";
import { BaristaLoading } from "./barista-loading";
import { FriendsProfile, FriendsProfileEditor } from "./friends-profile";
import { FriendAvatar } from "./friend-avatar";
import { TonyMascot } from "./mascot/tony-mascot";
import { SharedMaterials } from "./shared-materials";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import styles from "./friends.module.css";

function Person({ person, children, menu }: { person: FriendPerson; children?: React.ReactNode; menu?: React.ReactNode }) {
  return <li className={styles.person}><FriendAvatar name={person.name} photoURL={person.photoURL} /><div className={styles.personCopy}><strong>{person.name}</strong>{person.nickname && <span>@{person.nickname}</span>}<small>{[person.university, person.studyProgram].filter(Boolean).join(" · ")}</small>{person.status && <span className={styles.status} data-studying={person.status === "studying"}>{person.status !== "offline" && <i className={styles.liveDot} />}{person.status === "studying" ? "Sta studiando" : person.status === "online" ? "Online" : "Offline"}</span>}</div><div className={styles.personActions}>{children}{menu}</div></li>;
}
function FriendRequests({ title, people, actions }: { title: string; people: FriendPerson[]; actions: (person: FriendPerson) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (!people.length) return null;
  return <section className={`${styles.card} ${styles.requestCard}`} aria-label={title}>
    <h2><button type="button" className={styles.requestToggle} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <span>{title}</span><span className={styles.requestCount}>{people.length}</span><ChevronDown size={18} aria-hidden="true" />
    </button></h2>
    {!expanded && <div className={styles.requestPreview} aria-hidden="true"><div>{people.slice(0, 4).map(person => <FriendAvatar key={person.id} name={person.name} photoURL={person.photoURL} />)}{people.length > 4 && <span className={styles.moreRequests}>+{people.length - 4}</span>}</div><span>{people.slice(0, 2).map(person => person.name).join(", ")}{people.length > 2 ? " e altri" : ""}</span></div>}
    <div id={id} hidden={!expanded}>{expanded && <ul className={`${styles.list} ${styles.requestList}`}>{people.map(person => <Person key={person.id} person={person}>{actions(person)}</Person>)}</ul>}</div>
  </section>;
}
export function FriendsSection({ initialTab = "friends", onTabChange }: { initialTab?: string; onTabChange?: (tab: string) => void }) {
  const [tab, setTab] = useState(initialTab);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const settingsId = useId();
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  function changeTab(value: string) {
    setTab(value);
    onTabChange?.(value);
    window.history.replaceState(null, "", value === "invites" ? "/amici?tab=inviti" : "/amici");
  }
  const { profile } = useStudyProfile();
  const [data, setData] = useState<FriendsOverview | null>(null);
  const [sharedId, setSharedId] = useState("");
  const [shared, setShared] = useState<{ person: FriendPerson | null; self?: boolean } | null>(null);
  const [sharedError, setSharedError] = useState("");
  const [sharedRetry, setSharedRetry] = useState(0);
  useEffect(() => {
    const sync = () => { setSharedId(new URLSearchParams(window.location.search).get("profilo") || ""); };
    sync(); window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const period: FriendsPeriod = "day";
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ people: FriendPerson[]; truncated: boolean } | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false), sequence = useRef(0);
  useEffect(() => {
    if (!sharedId || !data?.available) return;
    const controller = new AbortController(); setShared(null); setSharedError("");
    void friendsRequest<{ person: FriendPerson | null; self?: boolean }>(`?profile=${encodeURIComponent(sharedId)}`, undefined, controller.signal)
      .then(value => { if (!controller.signal.aborted) setShared(value); })
      .catch(cause => { if (!controller.signal.aborted) setSharedError((cause as Error).message); });
    return () => controller.abort();
  }, [sharedId, data?.available, revision, sharedRetry]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const ticket = ++sequence.current;
    try {
      const result = await friendsRequest<FriendsOverview>(`?period=${period}`, undefined, signal);
      if (!signal?.aborted && ticket === sequence.current) { setData(result); setError(""); }
    } catch (cause) { if (!signal?.aborted && ticket === sequence.current) setError((cause as Error).message); }
  }, [period]);
  useEffect(() => {
    const controller = new AbortController(); void load(controller.signal);
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("studio-friends-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("studio-friends-changed", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [load, profile?.updatedAt]);
  useEffect(() => {
    if (!data?.available) { setResults(null); return; }
    const controller = new AbortController(); setSearching(true); setSearchError("");
    void friendsRequest<{ people: FriendPerson[]; truncated: boolean }>(`?search=${encodeURIComponent(query)}`, undefined, controller.signal).then(value => { if (!controller.signal.aborted) setResults(value); }).catch(cause => { if (!controller.signal.aborted) { setResults(null); setSearchError((cause as Error).message); } }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    return () => controller.abort();
  }, [query, revision, data?.available, profile?.updatedAt]);
  async function mutate(body: unknown, message: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try { await friendsRequest("", body); setNotice(message); await load(); setRevision(value => value + 1); friendsChanged(); return true; }
    catch (cause) { setError((cause as Error).message); return false; }
    finally { lock.current = false; setBusy(false); }
  }
  function relationship(person: FriendPerson, operation: "request" | "accept" | "reject" | "cancel" | "remove") {
    const messages = { request: "Richiesta inviata.", accept: `Ora tu e ${person.name} siete amici.`, reject: "Richiesta rifiutata.", cancel: "Richiesta annullata.", remove: "Amicizia rimossa." };
    void mutate({ action: "relationship", targetId: person.id, operation }, messages[operation]);
  }
  function settings(change: Partial<SocialSettings>) {
    const value = { discoverable: data?.self?.discoverable ?? true, shareActivity: data?.self?.shareActivity ?? true, ...change };
    void mutate({ action: "settings", discoverable: value.discoverable, shareActivity: value.shareActivity }, "Preferenze salvate.");
  }
  const requestActions = (person: FriendPerson) => <><Button size="sm" disabled={busy} onClick={() => relationship(person, "accept")} aria-label={`Accetta richiesta di ${person.name}`}><Check size={15} /> Accetta</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => relationship(person, "reject")} aria-label={`Rifiuta richiesta di ${person.name}`}><X size={15} /> Rifiuta</Button></>;
  return <section className={styles.section} aria-label="Amici">
    <header className={styles.friendsHeader}><h2>Amici</h2><Popover.Root open={settingsOpen} onOpenChange={setSettingsOpen}><Popover.Trigger asChild><button className={styles.settingsTrigger} aria-label="Impostazioni amici"><Settings2 size={21} /></button></Popover.Trigger><Popover.Portal><Popover.Content className={styles.activity} align="end" sideOffset={8} collisionPadding={12} onCloseAutoFocus={event => { if (editingProfile) event.preventDefault(); }}>
      <div className={styles.activityHeading}><h2>Impostazioni amici</h2><Popover.Close aria-label="Chiudi impostazioni amici"><X size={18} /></Popover.Close></div>
      <div className={styles.socialSettings}>
        <div className={styles.settingRow}>
          <span className={styles.settingIcon}><Eye size={18} aria-hidden="true" /></span>
          <div className={styles.settingCopy}><label id={`${settingsId}-visibility-title`} htmlFor={`${settingsId}-visibility`}>Visibilità del profilo</label><small id={`${settingsId}-visibility-description`}>Compari nella ricerca e nei suggerimenti.</small></div>
          <button id={`${settingsId}-visibility`} type="button" role="switch" aria-labelledby={`${settingsId}-visibility-title`} aria-describedby={`${settingsId}-visibility-description`} aria-checked={data?.self?.discoverable ?? true} className={styles.settingSwitch} disabled={busy || !data?.available} onClick={() => settings({ discoverable: !(data?.self?.discoverable ?? true) })}><span /></button>
        </div>
        <div className={styles.settingRow}>
          <span className={styles.settingIcon}><Activity size={18} aria-hidden="true" /></span>
          <div className={styles.settingCopy}><label id={`${settingsId}-activity-title`} htmlFor={`${settingsId}-activity`}>Stato e statistiche</label><small id={`${settingsId}-activity-description`}>Mostra agli amici quando studi e i tuoi progressi.</small></div>
          <button id={`${settingsId}-activity`} type="button" role="switch" aria-labelledby={`${settingsId}-activity-title`} aria-describedby={`${settingsId}-activity-description`} aria-checked={data?.self?.shareActivity ?? true} className={styles.settingSwitch} disabled={busy || !data?.available} onClick={() => settings({ shareActivity: !(data?.self?.shareActivity ?? true) })}><span /></button>
        </div>
      </div>
      {!!data?.blocked?.length && <div className={styles.blockedUsers}><h3>Utenti bloccati</h3>{data.blocked.map(person => <div key={person.id}><span>{person.name}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => void mutate({ action: "block", targetId: person.id, blocked: false }, "Utente sbloccato.")}>Sblocca</Button></div>)}</div>}
    </Popover.Content></Popover.Portal></Popover.Root></header>
    {editingProfile && <FriendsProfileEditor name={data?.self?.name} onClose={() => setEditingProfile(false)} />}
    <Tabs value={tab === "invites" ? "invites" : "friends"} onValueChange={changeTab} className={styles.tabs}>
      <TabsList aria-label="Sezioni amici"><TabsTrigger value="friends"><Users size={15} /> Amici</TabsTrigger><TabsTrigger value="invites"><UserPlus size={15} /> Inviti</TabsTrigger></TabsList>
      {error && <p className={styles.feedback} role="alert">{error} <Button variant="ghost" size="sm" onClick={() => void load()}>Riprova</Button></p>}
      {notice && <p className={styles.feedback} role="status">{notice}</p>}
      <TabsContent value="friends">
        {(data || error) && <FriendsProfile count={data?.friends.length || 0} name={data?.self?.name} discoverable={data?.self?.discoverable ?? true} onEdit={() => setEditingProfile(true)} />}
        {!data && !error && <BaristaLoading name="I tuoi amici" statusText="Caricamento amici." hint="Tony sta radunando il tuo gruppo di studio." />}
        {data && !data.available && <div className={styles.card}><p>Accedi con il tuo account Google nello spazio online per trovare i tuoi amici.</p></div>}
        {data?.available && <>
          {sharedId && <div className={styles.card} aria-label="Profilo condiviso"><h2>Profilo condiviso</h2>
            {sharedError ? <p role="alert">{sharedError} <Button variant="ghost" size="sm" onClick={() => setSharedRetry(value => value + 1)}>Riprova</Button></p> : !shared ? <p role="status">Caricamento profilo…</p> : shared.self ? <p>Questo è il tuo profilo. Condividi il link con un amico!</p> : !shared.person ? <p>Questo profilo non è disponibile.</p> : <ul className={styles.list}><Person person={shared.person}>{shared.person.relationship === "friend" ? <span className={styles.pill}><Check size={13} /> Amici</span> : shared.person.relationship === "incoming" ? requestActions(shared.person) : shared.person.relationship === "outgoing" ? <span className={styles.pill}>Richiesta inviata</span> : <Button size="sm" disabled={busy} onClick={() => relationship(shared.person!, "request")}><UserPlus size={15} /> Aggiungi agli amici</Button>}</Person></ul>}
          </div>}
          <FriendRequests title="Richieste ricevute" people={data.incoming} actions={requestActions} />
          <form className={styles.search} role="search" onSubmit={event => { event.preventDefault(); setQuery(term.trim()); setRevision(value => value + 1); }}><label className="sr-only" htmlFor="friend-search">Nome o username</label><Input id="friend-search" value={term} onChange={event => setTerm(event.target.value)} maxLength={80} placeholder="Cerca per nome o @username" /><Button type="submit"><Search size={16} /> Cerca</Button></form>
          <div className={styles.card}><h2>I tuoi amici</h2><ul className={styles.list}><li className={`${styles.person} ${styles.tonyFriend}`}><TonyMascot size={data.friends.length ? 64 : 96} animated showName={false} /><div className={styles.personCopy}><strong>Tony del bar</strong><span>{data.friends.length ? "Sempre qui a studiare con te." : "Non ti preoccupare, saremo per sempre amici."}</span></div></li>{data.friends.map(person => <Person key={person.id} person={person}><FriendActions person={person} friend busy={busy} onAction={mutate} /></Person>)}</ul></div>
          <div className={styles.card}><div className={styles.searchHeading}><h2>{query ? `Risultati per “${query}”` : "Dal tuo ateneo"}</h2>{query && <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setTerm(""); }}>Mostra suggeriti</Button>}</div>
            {searching && <BaristaLoading name="Cerchiamo i tuoi amici" statusText="Ricerca persone in corso." hint="Tony sta cercando nel tuo ateneo." />}{searchError && <p role="alert">{searchError} <Button variant="ghost" size="sm" onClick={() => setRevision(value => value + 1)}>Riprova</Button></p>}
            {!searching && !searchError && results && <>{!results.people.length ? <p>{query ? "Nessuna persona trovata. Prova un altro nome o username." : "Qui troverai altre persone del tuo ateneo."}</p> : <ul className={styles.list}>{results.people.map(person => <Person key={person.id} person={person} menu={<FriendActions person={person} friend={person.relationship === "friend"} busy={busy} onAction={mutate} />}>{person.relationship === "friend" ? <span className={styles.pill}><Check size={13} /> Amici</span> : person.relationship === "outgoing" ? <span className={styles.pill}>Richiesta inviata</span> : person.relationship === "incoming" ? requestActions(person) : <Button size="sm" variant="outline" disabled={busy} onClick={() => relationship(person, "request")} aria-label={`Invia richiesta a ${person.name}`}><UserPlus size={15} /> Aggiungi</Button>}</Person>)}</ul>}{results.truncated && <p>Scrivi un nome più preciso per vedere altri risultati.</p>}</>}
          </div>
          <FriendRequests title="Richieste inviate" people={data.outgoing} actions={person => <Button size="sm" variant="outline" disabled={busy} onClick={() => relationship(person, "cancel")} aria-label={`Annulla richiesta a ${person.name}`}>Annulla richiesta</Button>} />
          <SharedMaterials />
        </>}
      </TabsContent>
      <TabsContent value="invites"><ReferralsSection embedded /></TabsContent>
    </Tabs>
  </section>;
}
