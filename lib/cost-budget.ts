/** Fixed planning assumption, deliberately conservative; not a live FX quote. */
export const eurosPerDollar = 1;
export const monthlyUserReferenceEur = 9.99;
export const usdToEur = (usd: number) => usd * eurosPerDollar;
export const eurAmount = (value: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 8 }).format(value);
export const euroCost = (usd: number) => eurAmount(usdToEur(usd));

export function costBudget(usd: number | null) {
  if (usd === null) return null;
  const eur = usdToEur(usd);
  const percent = eur / monthlyUserReferenceEur * 100;
  return { eur, percent, fill: Math.min(100, Math.max(0, percent)), exceeded: Math.max(0, eur - monthlyUserReferenceEur), tone: percent >= 80 ? "high" : percent >= 50 ? "medium" : "low" };
}
