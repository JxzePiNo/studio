"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import { monthlyForecast, type MonthlyCostsReport } from "@/lib/admin-monthly-costs";
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
  const estimates = report?.users.map(user => ({ user, forecast: monthlyForecast(user, report.end) })) || [];
  const users = estimates.filter(({ user }) => `${user.name} ${user.email} ${user.uid}`.toLocaleLowerCase("it").includes(search.trim().toLocaleLowerCase("it"))).sort((a, b) => (b.forecast?.fullMonthUsd ?? -1) - (a.forecast?.fullMonthUsd ?? -1));
  const known = estimates.filter(item => item.forecast !== null);
  const forecastTotal = known.reduce((sum, item) => sum + item.forecast!.monthEndUsd, 0);
  const partialForecast = estimates.some(item => !item.forecast || !item.user.complete);
  const day = (value: string) => new Date(value).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  return <section aria-label="Costi utenti del mese corrente">
    <div className={styles.toolbar}><h1>Costi utenti · mese corrente</h1><Button variant="outline" disabled={loading} onClick={() => setRevision(value => value + 1)}>Aggiorna costi mensili</Button></div>
    <p className={styles.hint}>Costi OpenAI dal primo giorno del mese a oggi, nel fuso Europe/Rome. Include tutti gli utenti e tutte le richieste registrate nel periodo, anche correzioni automatiche e tentativi incompleti con token disponibili.</p>
    {loading && <div className={styles.loadingPanel}><BaristaLoading name="Costi mensili utenti" statusText="Calcolo i costi del mese corrente." hint="Sto preparando il conto per ogni utente." /></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {report && <>
      <p>Periodo: <strong>{new Date(report.start).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" })}</strong> · dal {day(report.start)} al {day(report.end)} · aggiornato alle {new Date(report.end).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome" })}</p>
      <div className={styles.metrics}>
        <div><span>Speso finora</span><strong>{report.incompleteUsers ? "Almeno " : ""}{euroCost(report.usd)}</strong></div>
        <div><span>Previsione fine mese</span><strong>{known.length ? `${partialForecast ? "Almeno " : ""}${euroCost(forecastTotal)}` : "Non disponibile"}</strong></div>
        <div><span>Richieste nel mese</span><strong>{report.calls.toLocaleString("it-IT")}</strong></div>
        <div><span>Previsioni incomplete</span><strong>{estimates.filter(item => !item.forecast || !item.user.complete).length}</strong></div>
      </div>
      <PricingNote />
      <p className={styles.hint}>Confronto su {eurAmount(monthlyUserReferenceEur)} al mese per utente. La barra usa la previsione per un mese completo, al ritmo di consumo attuale. Il confronto riguarda il solo costo OpenAI.</p>
      <details className={styles.forecastHelp}><summary>Come funziona la previsione</summary><p>Dividiamo il costo maturato per i giorni dal primo del mese o dalla data di iscrizione, se successiva, includendo oggi. La media giornaliera moltiplicata per i giorni del mese dà la stima «Mese completo». «Fine mese» aggiunge alla spesa attuale la media dei giorni rimanenti. Con meno di 3 giorni osservati la stima è preliminare. I calcoli mantengono la precisione completa; solo gli importi visualizzati sono arrotondati per difetto.</p></details>
      <label className={styles.field}>Cerca nei costi mensili<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, email o UID" /></label>
      <div className={`${styles.tableScroll} ${styles.monthlyTable}`}><table><thead><tr><th>Utente</th><th>Speso finora</th><th>Previsione mensile</th><th>Su €9,99 al mese</th><th>Attività</th></tr></thead><tbody>{users.map(({ user, forecast }) => <tr key={user.uid}>
        <td><strong>{user.name || "Senza nome"}</strong><small>{user.email || user.uid}</small>{user.createdAt && Number.isFinite(Date.parse(user.createdAt)) && <small>Iscritto il {day(user.createdAt)}</small>}</td>
        <td><strong>{user.usd === null ? "Non disponibile" : `${user.complete ? "" : "Almeno "}${euroCost(user.usd)}`}</strong>{!user.complete && <small>{user.unpricedCalls} richieste con costo incompleto</small>}</td>
        <td>{forecast ? <><strong>Mese completo: {user.complete ? "" : "almeno "}{euroCost(forecast.fullMonthUsd)}</strong><small>Fine mese: {user.complete ? "" : "almeno "}{euroCost(forecast.monthEndUsd)}</small><small>{euroCost(forecast.dailyUsd)}/giorno · {forecast.observedDays} {forecast.observedDays === 1 ? "giorno osservato" : "giorni osservati"}</small>{forecast.preliminary && <small>Stima preliminare · pochi dati</small>}</> : <><span>Non disponibile</span><small>{user.createdAt ? "Consumi insufficienti" : "Data di iscrizione non disponibile"}</small></>}</td>
        <td><AdminCostProgress usd={forecast?.fullMonthUsd ?? null} complete={user.complete} name={user.name || user.email || user.uid} /></td>
        <td>{user.calls.toLocaleString("it-IT")} richieste<small>{user.tokens.toLocaleString("it-IT")} token</small>{!user.calls && <small>Nessuna richiesta registrata</small>}</td>
      </tr>)}</tbody></table></div>
      {!users.length && <p>Nessun utente trovato.</p>}
      <p className={styles.hint}>{report.users.length} utenti · ordinati per previsione su un mese completo, dalla più alta. I totali comprendono tutti gli utenti del report, anche durante la ricerca. Le richieste antecedenti all'attivazione del monitoraggio non sono incluse; le previsioni dipendono dai dati disponibili.</p>
    </>}
  </section>;
}
