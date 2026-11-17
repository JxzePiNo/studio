import { costBudget, eurAmount, monthlyUserReferenceEur } from "@/lib/cost-budget";
import styles from "./admin-dashboard.module.css";

export function AdminCostProgress({ usd, complete, name }: { usd: number | null; complete: boolean; name: string }) {
  const budget = costBudget(usd);
  const percent = budget?.percent.toLocaleString("it-IT", { maximumFractionDigits: 1 });
  const text = budget ? `${complete ? "" : "Almeno "}${percent}% di ${eurAmount(monthlyUserReferenceEur)}` : "Costo non disponibile";
  return <div className={styles.costProgress}>
    <div role="progressbar" aria-label={`Costo mensile di ${name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={budget?.fill} aria-valuetext={text} className={styles.costTrack} data-tone={budget?.tone || "unknown"}>
      {budget && <span style={{ width: `${budget.fill}%` }} />}
    </div>
    <span>{text}</span>
    {budget && budget.exceeded > 0 && <small>Superato di {complete ? "" : "almeno "}{eurAmount(budget.exceeded)}</small>}
    {!complete && <small>Stima incompleta</small>}
  </div>;
}
