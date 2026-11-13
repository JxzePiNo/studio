"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Check, Globe2, GraduationCap, Share2, Users } from "lucide-react";
import { sharingChanged, sharingRequest } from "@/lib/sharing-client";
import { invalidateApiCache } from "@/lib/browser-data-cache";
import type { ShareSummary, SharingOverview } from "@/lib/sharing-types";
import { useStudyProfile } from "./study-profile-provider";
import { Button } from "./ui/button";
import styles from "./sharing.module.css";

export function SharedMaterials({ home = false }: { home?: boolean }) {
  const { profile } = useStudyProfile();
  const [data, setData] = useState<SharingOverview | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState("");
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const result = await sharingRequest<SharingOverview>(undefined, signal); if (!signal?.aborted) { setData(result); setError(""); } } catch (cause) { if (!signal?.aborted) setError((cause as Error).message); }
  }, []);
  useEffect(() => {
    const controller = new AbortController(); void load(controller.signal);
    const update = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const timer = setInterval(update, 60000); window.addEventListener("studio-sharing-changed", update);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("studio-sharing-changed", update); };
  }, [load, profile?.updatedAt]);
  async function use(share: ShareSummary) {
    if (share.imported && share.folderId) { window.dispatchEvent(new CustomEvent("studio-open-shared-course", { detail: { folderId: share.folderId } })); return; }
    if (lock.current) return;
    lock.current = true; setBusy(share.id); setError("");
    try {
      const result = await sharingRequest<{ folderId: string }>({ action: "import", shareId: share.id });
      await invalidateApiCache("/api/folders", "/api/documents"); sharingChanged();
      window.dispatchEvent(new CustomEvent("studio-open-shared-course", { detail: result }));
    } catch (cause) { setError((cause as Error).message); } finally { lock.current = false; setBusy(""); }
  }
  async function revoke(id: string) {
    if (lock.current) return;
    lock.current = true; setBusy(id); setError("");
    try { await sharingRequest({ action: "revoke", shareId: id }); await load(); sharingChanged(); }
    catch (cause) { setError((cause as Error).message); } finally { lock.current = false; setBusy(""); }
  }
  const cards = (shares: ShareSummary[], sent = false) => <ul className={styles.cards}>{shares.map(share => <li key={share.id}><span className={styles.kind}>{share.mode === "coauthor" ? <Users size={18} /> : share.visibility === "public" ? <Globe2 size={18} /> : <BookOpen size={18} />}{share.mode === "coauthor" ? "Spazio con coautori" : share.kind === "course" ? "Corso" : share.kind === "quiz" ? "Quiz" : "PDF"}</span><h3>{share.title}</h3><p>Da {share.ownerName}</p><span className={styles.provenance}><GraduationCap size={15} />{share.provenance.university || "Università non indicata"}</span><small>{share.provenance.studyProgram}</small><small>{share.documentCount} {share.documentCount === 1 ? "PDF" : "PDF"}{share.includeChat ? " · Con cronologia chat" : " · Analisi incluse"}</small>{sent ? <><span className={styles.pill}>{share.visibility === "public" ? "Pubblico" : `${share.recipientIds.length} destinatari`}</span><Button size="sm" variant="outline" disabled={!!busy} onClick={() => void revoke(share.id)}>{busy === share.id ? "Aggiorno…" : share.visibility === "public" ? "Rendi privato" : "Revoca invito"}</Button></> : <Button size="sm" variant={share.imported ? "outline" : "default"} disabled={!!busy} onClick={() => void use(share)}>{share.imported && <Check size={14} />}{busy === share.id ? "Preparo lo spazio…" : share.imported ? "Apri il tuo spazio" : share.mode === "coauthor" ? "Entra come coautore" : "Usa nel mio spazio"}</Button>}</li>)}</ul>;
  if (home && data && !data.available) return null;
  return <section className={`${styles.collection} ${home ? styles.home : ""}`} aria-label={home ? "Corsi pubblici" : "Materiali condivisi"}>
    <header><span>{home ? <Globe2 size={21} /> : <Share2 size={21} />}</span><div><h2>{home ? "Dal tuo corso di laurea." : "Il sapere fa un giro in più."}</h2><p>{home ? "Corsi messi a disposizione da altri studenti. Crea il tuo spazio, con le analisi già pronte." : "Corsi, PDF e quiz condivisi tra amici."}</p></div></header>
    {error && <p role="alert">{error} <Button variant="ghost" size="sm" onClick={() => void load()}>Riprova</Button></p>}
    {!data && !error && <p role="status">Carico i materiali condivisi…</p>}
    {data?.available && (home ? data.publicCourses.length ? cards(data.publicCourses) : <p className={styles.empty}>Non ci sono ancora corsi pubblici per {profile?.studyProgram || "il tuo percorso"}. I primi appunti condivisi potrebbero essere i tuoi.</p> : <><h3>Condivisi con te</h3>{data.received.length ? cards(data.received) : <p className={styles.empty}>Qui troverai gli inviti dei tuoi amici. Per condividere, apri il menu di un corso, di un PDF o di un quiz.</p>}<h3>Le tue condivisioni</h3>{data.sent.length ? cards(data.sent, true) : <p className={styles.empty}>Non hai ancora condiviso materiali.</p>}</>)}
    {data && !data.available && !home && <p>La condivisione tra persone è disponibile nello spazio online con account Google.</p>}
  </section>;
}
