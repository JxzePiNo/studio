"use client";
import { useCallback, useEffect, useState } from "react";
import { authHeaders, firebaseEnabled } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { StudyQuiz } from "@/lib/quiz";
import type { QuizPeerResult } from "@/lib/quiz-groups";
import { Button } from "./ui/button";
import styles from "./sharing.module.css";

type Group = { id: string; title: string; people: QuizPeerResult[] };
export function QuizPeerResults({ quiz, saved }: { quiz: StudyQuiz; saved: boolean }) {
  const [groups, setGroups] = useState<Group[] | null>(null), [error, setError] = useState(""), [includeAnswers, setIncludeAnswers] = useState(false), [busy, setBusy] = useState(false);
  const endpoint = `/api/documents/${quiz.documentId}/quiz/${quiz.id}/peers`;
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch(endpoint, { headers: await authHeaders(), signal, cache: "no-store" }); const result = await readApiResponse<{ groups: Group[] }>(response); if (!signal?.aborted) { setGroups(result.groups); setError(""); } } catch (cause) { if (!signal?.aborted) setError((cause as Error).message); }
  }, [endpoint]);
  useEffect(() => { if (!firebaseEnabled || !saved) return; const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, saved]);
  async function publish(remove = false) {
    if (busy) return; setBusy(true); setError("");
    try { await readApiResponse(await fetch(endpoint, { method: remove ? "DELETE" : "POST", headers: { ...await authHeaders(), "Content-Type": "application/json" }, ...(remove ? {} : { body: JSON.stringify({ includeAnswers }) }) })); await load(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  if (!firebaseEnabled || !saved || (groups && !groups.length)) return null;
  return <section className={styles.peerResults} aria-label="Risultati dei compagni"><h3>Ora tocca al confronto.</h3><p>I risultati del gruppo si sbloccano dopo aver completato e salvato il quiz.</p>{error && <p role="alert">{error} <Button size="sm" variant="ghost" onClick={() => void load()}>Riprova</Button></p>}{groups && groups.length > 0 && <><label><input type="checkbox" checked={includeAnswers} onChange={event => setIncludeAnswers(event.target.checked)} disabled={busy} /> Includi anche le mie risposte</label><div className={styles.peerActions}><Button size="sm" disabled={busy} onClick={() => void publish()}>Condividi il mio risultato</Button>{groups.some(group => group.people.some(person => person.self)) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void publish(true)}>Ritira il mio risultato</Button>}</div>{groups.map(group => <section key={group.id}><h4>{group.title}</h4>{group.people.length ? <ol aria-label={`Classifica quiz ${group.title}`}>{group.people.map(person => <li key={person.id}><strong>{person.name}{person.self ? " (Tu)" : ""}</strong> · {person.result.grade === null ? "Completato" : `${person.result.grade}/30`}<small>{person.university || "Università non indicata"} · {person.result.correct}/{person.result.total}</small>{person.result.answers && <details><summary>Risposte condivise</summary>{Object.entries(person.result.answers).map(([index, answer]) => { const question = quiz.questions[Number(index)]; return <p key={index}><strong>Domanda {Number(index) + 1}</strong><br />{question?.type === "open" ? answer : question?.options[Number(answer)] || "Non risposta"}</p>; })}</details>}</li>)}</ol> : <p>Nessuno ha ancora condiviso il proprio risultato.</p>}</section>)}</>}</section>;
}
