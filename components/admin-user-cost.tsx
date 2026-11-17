import { estimateUserCost, pricingCheckedAt, pricingSource, type TokenRate } from "@/lib/openai-pricing";
import { euroCost } from "@/lib/cost-budget";
import type { UsageSummary } from "@/lib/admin-types";
import styles from "./admin-dashboard.module.css";

export function AdminUserCost({ usage, rates }: { usage: UsageSummary | null; rates: Record<string, TokenRate> }) {
  const cost = estimateUserCost(usage, rates);
  return <><span>{cost.usd === null ? "Non disponibile" : `${cost.complete ? "" : "Almeno "}${euroCost(cost.usd)}`}</span>{!cost.complete && usage && <small className={styles.hint}>Stima incompleta · {cost.unpricedCalls} richieste da verificare</small>}</>;
}

export function PricingNote() {
  return <p className={styles.hint}>Costi stimati in EUR dai token registrati: cambio prudenziale fisso 1 USD = 1 EUR, ipotesi di pianificazione e non cambio in tempo reale. Tariffe OpenAI in USD verificate il {pricingCheckedAt}; eventuali tariffe manuali prevalgono per i modelli testuali. Esclude IVA, commissioni di cambio, Firebase e hosting. Lo storico prima del monitoraggio non è ricostruibile. <a className={styles.costLink} href={pricingSource} target="_blank" rel="noopener noreferrer">Listino ufficiale OpenAI</a>.</p>;
}
