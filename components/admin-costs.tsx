"use client";
import { BaristaLoading } from "./barista-loading";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { authHeaders } from "@/lib/firebase-client";
import { readApiResponse } from "@/lib/api-response";
import type { AdminCostsReport, CostEntry, ProviderCosts } from "@/lib/admin-cost-types";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import styles from "./admin-dashboard.module.css";

const money = (amount: number, currency: string) => new Intl.NumberFormat("it-IT", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(amount);
function aggregate(entries: CostEntry[], group: "service" | "currency") {
  const rows = new Map<string, { label: string; currency: string; amount: number }>();
  for (const entry of entries) {
    const label = group === "service" ? entry.service : entry.currency;
    const key = JSON.stringify([label, entry.currency]);
    const row = rows.get(key) || { label, currency: entry.currency, amount: 0 };
    row.amount += entry.amount; rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.amount - a.amount);
}

export function AdminCosts() {
  const [days, setDays] = useState(30), [revision, setRevision] = useState(0);
  const [report, setReport] = useState<AdminCostsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setReport(null); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/admin/costs?days=${days}`, { headers: await authHeaders(), cache: "no-store", signal: controller.signal });
        const value = await readApiResponse<AdminCostsReport>(response);
        if (!controller.signal.aborted) setReport(value);
      } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [days, revision]);

  return <section aria-label="Costi dei fornitori">
    <div className={styles.toolbar}><h1>Costi</h1><div className={styles.controls}><label>Periodo<Select value={String(days)} onValueChange={value => setDays(Number(value))}><SelectTrigger aria-label="Periodo"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="7">Ultimi 7 giorni</SelectItem><SelectItem value="30">Ultimi 30 giorni</SelectItem><SelectItem value="90">Ultimi 90 giorni</SelectItem></SelectContent></Select></label><Button variant="outline" size="sm" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={14} /> Aggiorna costi</Button></div></div>
    <p className={styles.hint}>Spesa riportata da OpenAI e Google Cloud Billing. I dati possono arrivare in ritardo e vengono aggiornati al massimo ogni 5 minuti. Le valute sono mantenute separate.</p>
    {loading && <div className={styles.loadingPanel}><BaristaLoading name="Costi della piattaforma" statusText="Carico i costi dai fornitori." hint="Sto preparando il conto. Quello vero." /></div>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {report && <><p className={styles.hint}>Dal {new Date(report.start).toLocaleDateString("it-IT", { timeZone: "UTC" })} al {new Date(report.end).toLocaleDateString("it-IT", { timeZone: "UTC" })} · giorni in UTC, incluso oggi.</p><div className={styles.costProviders}><Provider title="OpenAI" value={report.openai} /><Provider title="Firebase" value={report.firebase} /></div></>}
  </section>;
}

function Provider({ title, value }: { title: string; value: ProviderCosts }) {
  const totals = aggregate(value.entries, "currency"), services = aggregate(value.entries, "service");
  return <section className={styles.costCard} aria-label={`Costi ${title}`}>
    <header><h2>{title}</h2><span className={styles.hint}>{value.source}</span></header>
    <p className={styles.hint}>{value.scope}</p>
    {value.status !== "ready" ? <><strong className={styles.costTotal}>{value.status === "setup" ? "Da collegare" : "Non disponibili"}</strong><p role={value.status === "error" ? "alert" : undefined}>{value.message}</p><a className={styles.costLink} href={title === "OpenAI" ? "https://platform.openai.com/settings/organization/admin-keys" : "https://console.cloud.google.com/billing/export"} target="_blank" rel="noreferrer">{title === "OpenAI" ? "Apri le impostazioni OpenAI" : "Apri Google Cloud Billing"}</a></> : <>
      <div className={styles.costTotals}>{totals.map(total => <strong className={styles.costTotal} key={total.currency}>{money(total.amount, total.currency)}</strong>)}</div>
      {!value.entries.length ? <p>Nessun costo riportato dal fornitore per questo periodo. I dati più recenti potrebbero non essere ancora disponibili.</p> : <><div className={styles.tableScroll}><table><thead><tr><th>Voce di costo</th><th>Importo</th></tr></thead><tbody>{services.map(row => <tr key={JSON.stringify([row.label, row.currency])}><td>{row.label}</td><td>{money(row.amount, row.currency)}</td></tr>)}</tbody></table></div><details><summary>Dettaglio giornaliero</summary><div className={styles.tableScroll}><table><thead><tr><th>Giorno UTC</th><th>Voce</th><th>Importo</th></tr></thead><tbody>{value.entries.map((row, index) => <tr key={index}><td>{row.day}</td><td>{row.service}</td><td>{money(row.amount, row.currency)}</td></tr>)}</tbody></table></div></details></>}
      {value.updatedAt && <p className={styles.hint}>Letto il {new Date(value.updatedAt).toLocaleString("it-IT")}</p>}
    </>}
    {title === "Firebase" && <p className={styles.hint}>Include tutti i servizi Google Cloud del progetto Firebase, al netto dei crediti presenti nell'esportazione. La fattura può includere ulteriori rettifiche.</p>}
  </section>;
}
