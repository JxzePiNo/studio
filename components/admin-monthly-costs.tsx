"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { MonthlyCostsReport } from "@/lib/admin-monthly-costs";
import { euroCost, eurAmount, monthlyUserReferenceEur } from "@/lib/cost-budget";
import { AdminCostProgress } from "./admin-cost-progress";
import { PricingNote } from "./admin-user-cost";
import { Button } from "./ui/button";
import { BaristaLoading } from "./barista-loading";
import styles from "./admin-dashboard.module.css";

export function AdminMonthlyCosts() {
  const [report, setReport] = useState<MonthlyCostsReport | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [revision, setRevision] = useState(0), [search, setSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setReport(null);
    void (async () => {
      try {
        const response = await fetch("/api/admin/monthly-costs", { headers: await authHeaders(), cache: "no-store", signal: controller.signal });
        const value = await readApiResponse<MonthlyCostsReport>(response);
        if (!controller.signal.aborted) setReport(value);
      } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [revision]);
  const users = report?.users.filter(user => `${user.name} ${user.email} ${user.uid}`.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it"))) || [];
  const day = (value: string) => new Date(value).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  return <section aria-label="Costi utenti del mese corrente">
    <div className={styles.toolbar}><h1>Costi utenti · mese corrente</h1><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>Aggiorna costi mensili</Button></div>
    <p className={styles.hint}>Costi OpenAI dal primo giorno del mese a oggi, nel fuso Europe/Rome. Include tutti gli utenti e tutte le richieste registrate nel periodo, anche correzioni automatiche e tentativi incompleti con token disponibili.</p>
    {loading && <div className={styles.loadingPanel}><BaristaLoading name="Costi mensili utenti" statusText="Calcolo i costi del mese corrente." hint="Sto preparando il conto per ogni utente." /></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {report && <>
      <p>Periodo: <strong>{new Date(report.start).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" })}</strong> · dal {day(report.start)} al {day(report.end)} · aggiornato alle {new Date(report.end).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" })}</p>
      <div className={styles.metrics}>
        <div><span>Totale OpenAI registrato (EUR)</span><strong>{report.incompleteUsers ? "Almeno " : ""}{euroCost(report.usd)}</strong></div>
        <div><span>Utenti</span><strong>{report.users.length}</strong></div>
        <div><span>Richieste nel mese</span><strong>{report.calls.toLocaleString("it-IT")}</strong></div>
        <div><span>Utenti con stima incompleta</span><strong>{report.incompleteUsers}</strong></div>
      </div>
      <PricingNote />
      <p className={styles.hint}>Riferimento mensile per utente: {eurAmount(monthlyUserReferenceEur)}. La barra confronta il solo costo OpenAI con questo importo; non rappresenta il margine netto del servizio.</p>
      <label className={styles.field}>Cerca nei costi mensili<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, email o UID" /></label>
      <div className={`${styles.tableScroll} ${styles.monthlyTable}`}><table><thead><tr><th>Utente</th><th>Costo del mese (EUR)</th><th>Confronto con €9,99</th><th>Richieste</th><th>Token</th><th>Copertura</th></tr></thead><tbody>{users.map(user => <tr key={user.uid}>
        <td><strong>{user.name || "Senza nome"}</strong><small>{user.email || user.uid}</small></td>
        <td>{user.usd === null ? "Non disponibile" : `${user.complete ? "" : "Almeno "}${euroCost(user.usd)}`}</td>
        <td><AdminCostProgress usd={user.usd} complete={user.complete} name={user.name || user.email || user.uid} /></td>
        <td>{user.calls.toLocaleString("it-IT")}</td><td>{user.tokens.toLocaleString("it-IT")}</td>
        <td>{!user.calls ? "Nessuna richiesta registrata" : user.complete ? "Richieste registrate valorizzate" : `${user.unpricedCalls} richieste con costo incompleto`}</td>
      </tr>)}</tbody></table></div>
      {!users.length && <p>Nessun utente trovato.</p>}
      <p className={styles.hint}>Ordinati dal costo più alto. I totali comprendono tutti gli utenti del report, anche quando la ricerca filtra la tabella. Le richieste antecedenti all'attivazione del monitoraggio non sono incluse.</p>
    </>}
  </section>;
}
