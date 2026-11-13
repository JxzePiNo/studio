"use client";
import { useEffect, useRef, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { Download, House, Play, RefreshCw, Users, Settings2, Tags, ScrollText, Wallet } from "lucide-react";
import type { ReferralWelcome as Welcome } from "@/lib/referrals";
import { AdminWelcomePreview, AdminWelcomeTools } from "./admin-welcome-preview";
import { authHeaders, browserAuth, firebaseEnabled } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { featureLabels, type Feature, type PlatformConfig } from "@/lib/platform-config";
import type { AdminOverview, AdminDetail, AdminDocument, UsageSummary, AdminQuestion, UsageEvent } from "@/lib/admin-types";
import type { StudyDocument } from "@/lib/types";
import { NicknameSettings } from "./nickname-settings";
import { NicknamesProvider } from "./nicknames-provider";
import { Button } from "./ui/button";
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from "./ui/sidebar";
import { SidebarProfile } from "./sidebar-profile";
import { StudyProfileProvider } from "./study-profile-provider";
import { AdminCosts } from "./admin-costs";
import styles from "./admin-dashboard.module.css";
import { BaristaLoading } from "./barista-loading";
import { MobileNavigation } from "./mobile-navigation";
import { usePlatformVisit } from "./use-platform-visit";

const number = (value: number) => new Intl.NumberFormat("it-IT").format(value);
const date = (value?: string | null) => value ? new Date(value).toLocaleString("it-IT") : "—";
const tokenCount = (usage: UsageSummary | null) => Object.values(usage?.models || {}).reduce((sum, model) => sum + model.total, 0);
async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return readApiResponse<T>(await fetch(path, { method: body ? "PATCH" : "GET", headers: { ...await authHeaders(), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal, cache: "no-store" }));
}
function exportJson(value: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `${name}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export default function AdminDashboard() {
  const [sidebar, setSidebar] = useState(false);
  const [welcomePreview, setWelcomePreview] = useState<Welcome | null>(null);
  const [ready, setReady] = useState(!firebaseEnabled), [signedIn, setSignedIn] = useState(!firebaseEnabled);
  const [sessionId, setSessionId] = useState("");
  usePlatformVisit(sessionId || undefined, firebaseEnabled);
  const [data, setData] = useState<AdminOverview | null>(null), [config, setConfig] = useState<PlatformConfig | null>(null);
  const [detail, setDetail] = useState<AdminDetail | null>(null), [document, setDocument] = useState<AdminDocument | null>(null);
  const [tab, setTab] = useState("users"), [search, setSearch] = useState(""), [modelName, setModelName] = useState("");
  const [error, setError] = useState(""), [status, setStatus] = useState(""), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const selection = useRef(0), lock = useRef(false);
  useEffect(() => { if (!firebaseEnabled) return; return onAuthStateChanged(browserAuth(), user => { setSignedIn(!!user); setSessionId(user?.uid || ""); setReady(true); setData(null); setDetail(null); setDocument(null); }); }, []);
  useEffect(() => {
    if (!ready || !signedIn) return;
    const controller = new AbortController();
    void api<AdminOverview>("/api/admin", undefined, controller.signal).then(value => { setData(value); setConfig(value.config); setError(""); }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, [ready, signedIn, sessionId]);
  async function run(action: () => Promise<void>) { if (lock.current) return; lock.current = true; setBusy(true); setError(""); setStatus(""); try { await action(); } catch (cause) { setError((cause as Error).message); } finally { lock.current = false; setBusy(false); } }
  async function loadUsers(cursor?: string) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : search.includes("@") ? `?email=${encodeURIComponent(search.trim())}` : "";
    const value = await api<AdminOverview>(`/api/admin${query}`); setData(value); setConfig(value.config);
  }
  async function selectUser(uid: string) { const revision = ++selection.current; setDocument(null); setConfirmation(""); const value = await api<AdminDetail>(`/api/admin/users/${encodeURIComponent(uid)}`); if (revision === selection.current) setDetail(value); }
  async function manage(body: unknown) { if (!detail) return; await api(`/api/admin/users/${detail.uid}`, body); await selectUser(detail.uid); await loadUsers(); setStatus("Operazione completata."); }
  async function more(view: "documents" | "questions" | "usageEvents", cursor: string | null) {
    if (!detail || !cursor) return;
    const result = await api<{ items: StudyDocument[] | AdminQuestion[] | UsageEvent[]; cursor: string | null }>(`/api/admin/users/${detail.uid}?view=${view}&after=${encodeURIComponent(cursor)}`);
    if (view === "documents") setDetail({ ...detail, documents: [...detail.documents, ...result.items as StudyDocument[]], documentsCursor: result.cursor });
    if (view === "questions") setDetail({ ...detail, questions: [...detail.questions, ...result.items as AdminQuestion[]], questionsCursor: result.cursor });
    if (view === "usageEvents") setDetail({ ...detail, events: [...detail.events, ...result.items as UsageEvent[]], eventsCursor: result.cursor });
  }
  async function openDocument(id: string, after?: string) {
    if (!detail) return;
    const value = await api<AdminDocument>(`/api/admin/users/${detail.uid}?documentId=${id}${after ? `&after=${after}` : ""}`);
    setDocument(after && document ? { ...value, slides: [...document.slides, ...value.slides] } : value);
  }
  async function downloadPdf(id: string) {
    if (!detail) return;
    const response = await fetch(`/api/admin/users/${detail.uid}/documents/${id}/pdf`, { headers: await authHeaders() });
    if (!response.ok) await readApiResponse(response);
    const url = URL.createObjectURL(await response.blob()), link = window.document.createElement("a"); link.href = url; link.download = `${id}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const visibleUsers = data?.users.filter(user => search.includes("@") || `${user.name} ${user.email} ${user.uid}`.toLowerCase().includes(search.toLowerCase())) || [];
  const sections = [{ key: "users", label: "Utenti", icon: Users }, { key: "costs", label: "Costi", icon: Wallet }, { key: "platform", label: "Piattaforma", icon: Settings2 }, { key: "nicknames", label: "Soprannomi", icon: Tags }, { key: "welcome", label: "Anteprima benvenuto", icon: Play }, { key: "audit", label: "Registro admin", icon: ScrollText }];
  const content = welcomePreview && data && signedIn ? <AdminWelcomePreview data={welcomePreview} onClose={() => setWelcomePreview(null)} /> : <SidebarProvider openMobile={sidebar} onOpenMobileChange={setSidebar}><div className={`app-shell admin-shell ${styles.shell}`}>
    <Sidebar>
      <SidebarHeader><a className="studio-brand" href="/" aria-label="Studio, pagina iniziale">studio<span>.</span></a></SidebarHeader>
      <SidebarContent><nav className="sidebar-study-nav" aria-label="Sezioni amministrazione"><SidebarMenu><SidebarMenuItem><SidebarMenuButton className="sidebar-session-link" asChild><a href="/"><House size={18} /><span>Home</span></a></SidebarMenuButton></SidebarMenuItem>{sections.map(({ key, label, icon: Icon }) => <SidebarMenuItem key={key}><SidebarMenuButton className="sidebar-session-link" isActive={tab === key} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setSidebar(false); }}><Icon size={18} /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></nav></SidebarContent>
      <SidebarFooter>{ready && signedIn && <SidebarProfile admin onSignOut={() => void run(async () => { await signOut(browserAuth()); })} />}</SidebarFooter>
    </Sidebar>
    <main className="main-shell"><div className={`${styles.dashboard}${tab === "users" ? ` ${styles.users}` : ""}`}>
    <SidebarTrigger className={styles.menu} />
    {!ready ? <div className={styles.loadingPanel}><BaristaLoading name="Il tuo spazio admin" statusText="Verifico l'accesso alla dashboard." hint="Tony sta preparando il pannello." /></div> : !signedIn ? <Button onClick={() => void run(async () => { await signInWithPopup(browserAuth(), new GoogleAuthProvider()); window.location.replace("/"); })}>Accedi con Google</Button> : !data && !error ? <div className={styles.loadingPanel}><BaristaLoading name="Dashboard amministratore" statusText="Carico la dashboard." hint="Utenti, attività e impostazioni arrivano tra poco." /></div> : null}
    {error && <div className={styles.error}><p role="alert">{error}</p>{signedIn && <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => loadUsers())}>Riprova</Button>}</div>}{status && <p className={styles.status} role="status">{status}</p>}
    {tab === "costs" && ready && signedIn && <AdminCosts key={sessionId} />}
    {tab !== "costs" && data && config && <>
      <div className={styles.toolbar}><h2>{sections.find(section => section.key === tab)?.label}</h2><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => loadUsers())}><RefreshCw size={14} /> Aggiorna</Button></div>
      {tab === "users" && <>
        <div className={styles.metrics}>{[["Utenti in questa pagina", data.users.length], ["File caricati", data.users.reduce((sum, user) => sum + user.files.count, 0)], ["Token registrati", data.users.reduce((sum, user) => sum + tokenCount(user.usage), 0)], ["Domande registrate", data.users.reduce((sum, user) => sum + (user.activity?.questions || 0), 0)]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{number(Number(value))}</strong></div>)}</div>
        <p className={styles.hint}>Totali relativi agli utenti della pagina. I consumi e il registro domande iniziano dall'attivazione del monitoraggio; lo storico precedente non è ricostruibile. Le conversazioni ancora salvate sono consultabili nei file.</p>
        <form className={styles.search} onSubmit={event => { event.preventDefault(); void run(() => loadUsers()); }}><label>Cerca per nome, UID o email<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Email completa per cercare in tutti gli utenti" /></label><Button disabled={busy}>Cerca</Button></form>
        <div className={styles.tableScroll}><table><thead><tr><th>Utente</th><th>Stato</th><th>Ultima visita</th><th>File / pagine</th><th>Token</th><th>Domande</th><th /></tr></thead><tbody>{visibleUsers.map(user => <tr key={user.uid}><td><strong>{user.name || "Senza nome"}</strong><small>{user.email}</small></td><td>{user.disabled ? "Sospeso" : "Attivo"}</td><td>{user.lastVisitAt ? date(user.lastVisitAt) : "Visita non ancora registrata"}</td><td>{user.files.count} / {number(user.files.pages)}<small>{(user.files.bytes / 1024 / 1024).toFixed(1)} MB</small></td><td>{user.usage ? number(tokenCount(user.usage)) : "Non disponibili"}</td><td>{user.activity?.questions ?? "—"}</td><td><Button variant="outline" size="sm" disabled={busy} onClick={() => void run(() => selectUser(user.uid))}>Gestisci</Button></td></tr>)}</tbody></table></div>
        {!visibleUsers.length && <p>Nessun utente trovato.</p>}{data.cursor && <Button variant="outline" disabled={busy} onClick={() => void run(() => loadUsers(data.cursor!))}>Pagina utenti successiva</Button>}
        {detail && <section className={styles.detail} aria-label="Dettaglio utente"><header><div><h2>{detail.user.name || detail.user.email}</h2><p>{detail.user.email} · {detail.uid}</p></div><Button variant="ghost" onClick={() => { selection.current++; setDetail(null); setDocument(null); }}>Chiudi dettaglio</Button><Button variant="outline" onClick={() => exportJson(detail, `utente-${detail.uid}`)}><Download size={14} /> Esporta dati caricati</Button></header>
          <div className={styles.userMeta}><span>Registrazione: {date(detail.user.createdAt)}</span><span>Ultima visita: {detail.user.lastVisitAt ? date(detail.user.lastVisitAt) : "Non ancora registrata"}</span><span>Ultimo login: {date(detail.user.lastLoginAt)}</span><span>Email {detail.user.verified ? "verificata" : "non verificata"}</span><span>Percorso: {detail.profile.studyProgram || "Non indicato"}</span></div>
          <UsagePanel usage={detail.usage} config={config} />
          <h3>Gestione account</h3><div className={styles.controls}><label>Nome visualizzato<input defaultValue={detail.user.name} key={`${detail.uid}-${detail.user.name}`} id="admin-user-name" maxLength={80} /></label><Button variant="outline" disabled={busy} onClick={() => void run(() => manage({ action: "name", name: (window.document.getElementById("admin-user-name") as HTMLInputElement).value }))}>Aggiorna nome</Button></div>
          <div className={styles.controls}><label>Conferma email per sospendere o revocare le sessioni<input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={detail.user.email} /></label><Button variant="outline" disabled={busy || confirmation !== detail.user.email || !confirmation} onClick={() => void run(() => manage({ action: "status", disabled: !detail.user.disabled }))}>{detail.user.disabled ? "Riattiva utente" : "Sospendi utente"}</Button><Button variant="outline" disabled={busy || confirmation !== detail.user.email || !confirmation} onClick={() => void run(() => manage({ action: "revoke" }))}>Revoca sessioni</Button></div>
          <h3>Funzionalità per questo utente</h3><p className={styles.hint}>Le disattivazioni globali prevalgono. Questi controlli vengono verificati dal server.</p><div className={styles.flags}>{Object.entries(featureLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={detail.controls.features?.[key as Feature] !== false} disabled={busy} onChange={event => setDetail({ ...detail, controls: { ...detail.controls, features: { ...detail.controls.features, [key]: event.target.checked } } })} />{label}</label>)}<label><input type="checkbox" checked={detail.controls.aiBlocked || false} onChange={event => setDetail({ ...detail, controls: { ...detail.controls, aiBlocked: event.target.checked } })} />Blocca tutte le generazioni AI</label></div>
          <label className={styles.field}>Nota amministrativa<textarea value={detail.controls.note || ""} maxLength={1000} onChange={event => setDetail({ ...detail, controls: { ...detail.controls, note: event.target.value } })} /></label><Button disabled={busy} onClick={() => void run(() => manage({ action: "controls", controls: detail.controls }))}>Salva controlli utente</Button>
          <h3>File caricati</h3><div className={styles.tableScroll}><table><thead><tr><th>File</th><th>Pagine</th><th>Dimensione</th><th>Caricato</th><th /></tr></thead><tbody>{detail.documents.map(file => <tr key={file.id}><td>{file.name}</td><td>{file.pages}</td><td>{(file.size / 1024 / 1024).toFixed(1)} MB</td><td>{date(file.createdAt)}</td><td><Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => openDocument(file.id))}>Conversazioni e analisi</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => downloadPdf(file.id))}>Scarica PDF</Button></td></tr>)}</tbody></table></div>{detail.documentsCursor && <Button disabled={busy} onClick={() => void run(() => more("documents", detail.documentsCursor))}>Altri file</Button>}
          {document && <section className={styles.document} aria-label="Contenuti del documento"><h3>{document.document.name}</h3><p>{document.quizzes.length} quiz caricati</p>{document.slides.map(slide => <details key={slide.page}><summary>Pagina {slide.page} · {slide.chat?.filter(message => message.role === "user").length || 0} domande salvate{slide.explanation ? " · analizzata" : ""}</summary>{slide.notes && <p>Appunti: {slide.notes}</p>}{slide.explanation && <pre>{JSON.stringify(slide.explanation, null, 2)}</pre>}{slide.chat?.map((message, index) => <article key={index}><strong>{message.role === "user" ? "Utente" : "Tony"}</strong><p>{message.content}</p></article>)}</details>)}{document.cursor && <Button disabled={busy} onClick={() => void run(() => openDocument(document.document.id, document.cursor!))}>Altre pagine</Button>}</section>}
          <h3>Domande e richieste</h3>{detail.questions.map(question => <details key={question.id}><summary>{date(question.at)} · {question.kind} · pagina {question.page}</summary><p>{question.question}</p><small>Documento: {question.documentId}</small></details>)}{!detail.questions.length && <p className={styles.hint}>Nessuna richiesta registrata dall'attivazione del monitoraggio.</p>}{detail.questionsCursor && <Button disabled={busy} onClick={() => void run(() => more("questions", detail.questionsCursor))}>Altre domande</Button>}
          <h3>Richieste AI</h3><div className={styles.tableScroll}><table><thead><tr><th>Data</th><th>Funzione / modello</th><th>Input / cache / output</th><th>Esito</th><th>Durata</th></tr></thead><tbody>{detail.events.map(event => <tr key={event.id}><td>{date(event.at)}</td><td>{event.feature}<small>{event.model}</small></td><td>{event.measured ? `${number(event.input)} / ${number(event.cached)} / ${number(event.output)}` : "Usage non disponibile"}</td><td>{event.status}</td><td>{(event.durationMs / 1000).toFixed(1)} s</td></tr>)}</tbody></table></div>{detail.eventsCursor && <Button disabled={busy} onClick={() => void run(() => more("usageEvents", detail.eventsCursor))}>Altre richieste AI</Button>}
          <h3>Corsi, sessioni e referral</h3><p>{detail.folders.length} corsi caricati · {detail.sessions.length} sessioni caricate</p><details><summary>Visualizza dati aggiuntivi</summary><pre>{JSON.stringify({ corsi: detail.folders, sessioni: detail.sessions, referral: detail.referral }, null, 2)}</pre></details>
        </section>}
      </>}
      {tab === "platform" && <section className={styles.detail}><h2>Controllo della piattaforma</h2><label className={styles.toggle}><input type="checkbox" checked={config.maintenance} onChange={event => setConfig({ ...config, maintenance: event.target.checked })} />Modalità manutenzione</label><label className={styles.field}>Messaggio agli utenti<input value={config.message} maxLength={300} onChange={event => setConfig({ ...config, message: event.target.value })} /></label><h3>Funzionalità globali</h3><div className={styles.flags}>{Object.entries(featureLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={config.features[key as Feature]} onChange={event => setConfig({ ...config, features: { ...config.features, [key]: event.target.checked } })} />{label}</label>)}</div><h3>Tariffe stimate · USD per milione di token</h3><p className={styles.hint}>Inserisci le tariffe del tuo contratto OpenAI. La stima usa le tariffe attuali configurate e non include tasse o costi di storage. Per modelli immagine con prezzi diversi per modalità, lascia la tariffa non configurata: i token sono comunque registrati.</p>{Object.entries(config.rates).map(([model, rate]) => <div className={styles.rates} key={model}><strong>{model}</strong>{(["input", "cached", "output"] as const).map(key => <label key={key}>{key}<input type="number" step="any" min="0" max="10000" value={rate[key]} onChange={event => setConfig({ ...config, rates: { ...config.rates, [model]: { ...rate, [key]: Number(event.target.value) } } })} /></label>)}<Button variant="ghost" onClick={() => { const rates = { ...config.rates }; delete rates[model]; setConfig({ ...config, rates }); }}>Rimuovi</Button></div>)}<div className={styles.controls}><input aria-label="Modello da aggiungere" placeholder="Es. gpt-4.1-mini" value={modelName} onChange={event => setModelName(event.target.value)} maxLength={80} /><Button variant="outline" disabled={!/^[a-zA-Z0-9._-]{1,80}$/.test(modelName)} onClick={() => { setConfig({ ...config, rates: { ...config.rates, [modelName]: config.rates[modelName] || { input: 0, cached: 0, output: 0 } } }); setModelName(""); }}>Aggiungi tariffa</Button></div><Button disabled={busy} onClick={() => void run(async () => { const value = await api<PlatformConfig>("/api/admin", config); setConfig(value); setStatus("Impostazioni salvate."); })}>Salva impostazioni piattaforma</Button></section>}
      {tab === "nicknames" && <section className={styles.detail}><NicknamesProvider><NicknameSettings /></NicknamesProvider></section>}
      {tab === "welcome" && <AdminWelcomeTools onStart={setWelcomePreview} />}
      {tab === "audit" && <section className={styles.detail}><h2>Registro operazioni admin</h2><p className={styles.hint}>Ultime 50 operazioni. Le richieste e i completamenti vengono registrati separatamente.</p><div className={styles.tableScroll}><table><thead><tr><th>Data</th><th>Operazione</th><th>Destinatario</th><th>Amministratore</th></tr></thead><tbody>{data.audit.map(event => <tr key={event.id}><td>{date(event.at)}</td><td>{event.action}</td><td>{event.target}</td><td>{event.actor}</td></tr>)}</tbody></table></div></section>}
    </>}
  </div></main>{ready && signedIn && <MobileNavigation admin home={() => window.location.assign("/")} sessions={() => window.location.assign("/sessioni")} friends={() => window.location.assign("/amici")} onSignOut={() => void run(async () => { await signOut(browserAuth()); })} />}</div></SidebarProvider>;
  return ready && signedIn ? <StudyProfileProvider key={sessionId} requireProfile={false}>{content}</StudyProfileProvider> : content;
}
function UsagePanel({ usage, config }: { usage: UsageSummary | null; config: PlatformConfig }) {
  if (!usage) return <p className={styles.hint}>Consumi non disponibili: nessuna chiamata registrata per questo utente.</p>;
  return <section><h3>Consumi AI</h3><p className={styles.hint}>Monitoraggio dal {date(usage.firstRecordedAt)} · {usage.calls} chiamate · {usage.errors} errori o interruzioni</p><div className={styles.tableScroll}><table><thead><tr><th>Modello</th><th>Input</th><th>In cache</th><th>Output</th><th>Totale</th><th>Stima USD</th></tr></thead><tbody>{Object.values(usage.models).map(model => { const rate = config.rates[model.model]; const cost = rate ? ((model.input - model.cached) * rate.input + model.cached * rate.cached + model.output * rate.output) / 1e6 : null; return <tr key={model.model}><td>{model.model}{model.unknown > 0 && <small>{model.unknown} chiamate senza usage</small>}</td><td>{number(model.input)}</td><td>{number(model.cached)}</td><td>{number(model.output)}</td><td>{number(model.total)}</td><td>{cost === null ? "Tariffa non configurata" : `$${cost.toFixed(4)}`}</td></tr>; })}</tbody></table></div></section>;
}
