import { GoogleAuth, JWT } from "google-auth-library";
import { z } from "zod";
import type { AdminCostsReport, CostEntry, ProviderCosts } from "./admin-cost-types";

type Period = { start: string; end: string };
type CostEnvironment = Record<string, string | undefined>;
const openaiPage = z.object({
  data: z.array(z.object({ start_time: z.number(), results: z.array(z.object({
    amount: z.object({ value: z.number(), currency: z.string().regex(/^[a-z]{3}$/i) }),
    line_item: z.string().nullish(),
  })) })),
  has_more: z.boolean(), next_page: z.string().nullish(),
});
const queryPage = z.object({
  jobComplete: z.boolean(),
  jobReference: z.object({ projectId: z.string(), jobId: z.string(), location: z.string().optional() }).optional(),
  rows: z.array(z.object({ f: z.array(z.object({ v: z.string().nullable() })).length(4) })).optional(),
  pageToken: z.string().optional(),
  errors: z.array(z.object({ reason: z.string().optional() })).optional(),
});
type QueryPage = z.infer<typeof queryPage>;

export function costPeriod(days: number, now = new Date()): Period {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { start: start.toISOString(), end: now.toISOString() };
}
function provider(source: string, scope: string): ProviderCosts {
  return { status: "setup", source, scope, message: "", entries: [], updatedAt: null };
}
function ready(base: ProviderCosts, entries: CostEntry[]): ProviderCosts {
  return { ...base, status: "ready", entries, updatedAt: new Date().toISOString() };
}
function failure(base: ProviderCosts, message: string): ProviderCosts {
  return { ...base, status: "error", message };
}

export async function openaiCosts(period: Period, env: CostEnvironment = process.env, request: typeof fetch = fetch): Promise<ProviderCosts> {
  const project = env.OPENAI_COSTS_PROJECT_ID;
  const base = provider("OpenAI Costs API", project ? `Progetto OpenAI ${project}` : "Intera organizzazione OpenAI");
  if (!env.OPENAI_ADMIN_KEY) return { ...base, message: "Collega una chiave amministrativa OpenAI per visualizzare i costi del tuo account." };
  const url = new URL("https://api.openai.com/v1/organization/costs");
  url.searchParams.set("start_time", String(Math.floor(Date.parse(period.start) / 1000)));
  url.searchParams.set("end_time", String(Math.floor(Date.parse(period.end) / 1000)));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", "180");
  url.searchParams.append("group_by[]", "line_item");
  if (project) url.searchParams.append("project_ids[]", project);
  const entries: CostEntry[] = [], cursors = new Set<string>();
  const deadline = AbortSignal.timeout(45000);
  try {
    for (let page = 0; page < 20; page++) {
      const response = await request(url, { headers: { Authorization: `Bearer ${env.OPENAI_ADMIN_KEY}` }, cache: "no-store", signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]) });
      if (!response.ok) return failure(base, response.status === 401 || response.status === 403 ? "OpenAI ha rifiutato l'accesso ai costi. Verifica la chiave amministrativa e i suoi permessi." : "OpenAI non ha reso disponibili i costi. Riprova tra poco.");
      const body = openaiPage.parse(await response.json());
      for (const bucket of body.data) for (const item of bucket.results) entries.push({ day: new Date(bucket.start_time * 1000).toISOString().slice(0, 10), service: item.line_item || "Consumo API", currency: item.amount.currency.toUpperCase(), amount: item.amount.value });
      if (!body.has_more) return ready(base, entries);
      if (!body.next_page || cursors.has(body.next_page)) break;
      cursors.add(body.next_page); url.searchParams.set("page", body.next_page);
    }
    return failure(base, "Il riepilogo OpenAI è incompleto. Riprova con un periodo più breve.");
  } catch { return failure(base, "Impossibile leggere i costi da OpenAI. Riprova tra poco."); }
}

export function billingQuery(table: string) {
  // Table identifiers cannot be query parameters; only allow a fixed configured table.
  if (!/^[a-z][a-z0-9-]{4,62}\.[a-zA-Z0-9_]+\.gcp_billing_export_(?:v1|resource_v1)_[a-zA-Z0-9_]+$/.test(table)) throw new Error("Tabella di fatturazione non valida.");
  return `SELECT CAST(DATE(usage_start_time, 'UTC') AS STRING) AS day,
    service.description AS service, currency,
    CAST(SUM(CAST(cost AS NUMERIC) + IFNULL((SELECT SUM(CAST(credit.amount AS NUMERIC)) FROM UNNEST(credits) AS credit), 0)) AS STRING) AS amount
    FROM \`${table}\`
    WHERE usage_start_time >= TIMESTAMP(@start) AND usage_start_time < TIMESTAMP(@end)
      AND project.id = @project
    GROUP BY day, service, currency ORDER BY day DESC, service`;
}

async function googleRequest(url: string, init: RequestInit): Promise<unknown> {
  const scopes = ["https://www.googleapis.com/auth/cloud-platform"];
  const authClient = process.env.FIREBASE_PRIVATE_KEY ? new JWT({ email: process.env.FIREBASE_CLIENT_EMAIL, key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), scopes }) : undefined;
  const auth = new GoogleAuth({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, authClient, scopes });
  const token = await auth.getAccessToken();
  if (!token) throw new Error("Credenziali Google non disponibili.");
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(20000)]), cache: "no-store" });
  if (!response.ok) throw new Error("Google Billing non disponibile.");
  return response.json();
}

export async function firebaseCosts(period: Period, env: CostEnvironment = process.env, request = googleRequest): Promise<ProviderCosts> {
  const project = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const base = provider("Google Cloud Billing · BigQuery", project ? `Tutti i servizi del progetto Firebase ${project}` : "Progetto Firebase");
  if (!env.GOOGLE_CLOUD_BILLING_TABLE || !project) return { ...base, message: "Collega l'esportazione di Google Cloud Billing in BigQuery per visualizzare la spesa del progetto Firebase." };
  const deadline = AbortSignal.timeout(45000);
  try {
    const query = billingQuery(env.GOOGLE_CLOUD_BILLING_TABLE);
    const queryProject = env.GOOGLE_CLOUD_BILLING_TABLE.split(".")[0];
    const location = env.GOOGLE_CLOUD_BILLING_LOCATION;
    const endpoint = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(queryProject)}/queries`;
    let body = queryPage.parse(await request(endpoint, { method: "POST", signal: deadline, body: JSON.stringify({
      query, useLegacySql: false, parameterMode: "NAMED", timeoutMs: 10000, maxResults: 10000,
      maximumBytesBilled: "1000000000", ...(location ? { location } : {}),
      queryParameters: Object.entries({ start: period.start, end: period.end, project }).map(([name, value]) => ({ name, parameterType: { type: "STRING" }, parameterValue: { value } })),
    }) }));
    const job = body.jobReference;
    const entries: CostEntry[] = [], cursors = new Set<string>();
    for (let page = 0; page < 20; page++) {
      if (body.errors?.length) throw new Error("Query di fatturazione non riuscita.");
      if (body.jobComplete) for (const row of body.rows || []) {
        const [day, service, currency, amount] = row.f.map(cell => cell.v);
        if (!day || !service || !currency || amount === null || !Number.isFinite(Number(amount))) throw new Error("Dati di fatturazione non validi.");
        entries.push({ day, service, currency, amount: Number(amount) });
      }
      if (body.jobComplete && !body.pageToken) return ready(base, entries);
      if (!job || body.pageToken && cursors.has(body.pageToken)) break;
      const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(job.projectId)}/queries/${encodeURIComponent(job.jobId)}`);
      url.searchParams.set("timeoutMs", "1000");
      url.searchParams.set("maxResults", "10000");
      if (job.location || location) url.searchParams.set("location", job.location || location!);
      if (body.pageToken) { cursors.add(body.pageToken); url.searchParams.set("pageToken", body.pageToken); }
      body = queryPage.parse(await request(url.href, { method: "GET", signal: deadline }));
    }
    return failure(base, "Il riepilogo Firebase non è ancora completo. Riprova tra poco.");
  } catch { return failure(base, "Impossibile leggere i costi Firebase. Verifica l'esportazione Billing, la località del dataset e i permessi BigQuery del server."); }
}

const reports = new Map<number, { at: number; config: string; value: AdminCostsReport }>();
export async function adminCosts(days: number): Promise<AdminCostsReport> {
  const config = [process.env.OPENAI_ADMIN_KEY, process.env.OPENAI_COSTS_PROJECT_ID, process.env.GOOGLE_CLOUD_BILLING_TABLE, process.env.GOOGLE_CLOUD_BILLING_LOCATION, process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID].join("|");
  const cached = reports.get(days);
  if (cached && cached.config === config && Date.now() - cached.at < 300000) return cached.value;
  const period = costPeriod(days);
  const [openai, firebase] = await Promise.all([openaiCosts(period), firebaseCosts(period)]);
  const value = { ...period, openai, firebase };
  if (openai.status !== "error" && firebase.status !== "error") reports.set(days, { at: Date.now(), config, value });
  return value;
}
