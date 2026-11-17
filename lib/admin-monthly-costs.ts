import type { UsageEvent } from "./admin-types";
import { estimateEventCost, type TokenRate } from "./openai-pricing";

export type MonthlyUserCost = {
  uid: string; name: string; email: string; calls: number; tokens: number;
  createdAt?: string | null;
  usd: number | null; complete: boolean; unpricedCalls: number;
};
export type MonthlyCostsReport = {
  month: string; start: string; end: string; timeZone: "Europe/Rome";
  users: MonthlyUserCost[]; usd: number; incompleteUsers: number; calls: number;
};

/** Calendar month in Italy, independent of the server's local/UTC timezone. */
export function currentCostMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find(part => part.type === "year")!.value;
  const month = parts.find(part => part.type === "month")!.value;
  const midnight = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", timeZoneName: "longOffset" }).formatToParts(midnight).find(part => part.type === "timeZoneName")!.value;
  return { month: `${year}-${month}`, start: new Date(`${year}-${month}-01T00:00:00${offset.replace("GMT", "")}`).toISOString(), end: now.toISOString(), timeZone: "Europe/Rome" as const };
}

export function emptyMonthlyUser(user: { uid: string; name: string; email: string; createdAt?: string | null }): MonthlyUserCost {
  return { ...user, calls: 0, tokens: 0, usd: 0, complete: true, unpricedCalls: 0 };
}

/** Inclusive Italian calendar days, so DST and a partial signup day count once. */
export function monthlyForecast(user: MonthlyUserCost, end: string) {
  if (user.usd === null || !user.createdAt || !Number.isFinite(Date.parse(user.createdAt))) return null;
  const now = new Date(end), registered = new Date(user.createdAt);
  if (!Number.isFinite(now.getTime()) || registered > now) return null;
  const calendar = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Rome", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
    const part = (name: string) => Number(parts.find(item => item.type === name)!.value);
    return { year: part("year"), month: part("month"), day: part("day") };
  };
  const today = calendar(now), signup = calendar(registered);
  const todayStamp = Date.UTC(today.year, today.month - 1, today.day);
  const firstStamp = Date.UTC(today.year, today.month - 1, 1);
  const signupStamp = Date.UTC(signup.year, signup.month - 1, signup.day);
  const observedDays = (todayStamp - Math.max(firstStamp, signupStamp)) / 86400000 + 1;
  const monthDays = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();
  const dailyUsd = user.usd / observedDays;
  return { observedDays, monthDays, dailyUsd, fullMonthUsd: dailyUsd * monthDays, monthEndUsd: user.usd + dailyUsd * (monthDays - today.day), preliminary: observedDays < 3 };
}

export function addMonthlyEvent(row: MonthlyUserCost, event: UsageEvent, rates: Record<string, TokenRate>, period: { start: string; end: string }): MonthlyUserCost {
  if (event.at < period.start || event.at >= period.end) return row;
  const cost = estimateEventCost(event, rates);
  return { ...row, calls: row.calls + 1, tokens: row.tokens + event.total, usd: cost.usd === null ? (row.calls === 0 ? null : row.usd) : (row.usd || 0) + cost.usd, complete: row.complete && cost.complete, unpricedCalls: row.unpricedCalls + cost.unpricedCalls };
}
