import type { UsageEvent, UsageModel, UsageSummary } from "./admin-types";

/** Standard API list prices, USD per million tokens. Never use Batch rates here.
 * https://developers.openai.com/api/docs/pricing.md
 * Image cache discounts do not apply to this app's direct Images API calls.
 */
export const pricingCheckedAt = "2026-11-17";
export const pricingSource = "https://developers.openai.com/api/docs/pricing";
export type TokenRate = { input: number; cached: number; output: number };
export const officialTextRates: Record<string, TokenRate> = {
  "gpt-4.1-mini": { input: 0.4, cached: 0.1, output: 1.6 },
  "gpt-4.1-mini-2025-04-14": { input: 0.4, cached: 0.1, output: 1.6 },
};
const imageModels = new Set(["gpt-image-2", "gpt-image-2-2026-04-21"]);
export function isPricedImageModel(model: string) { return imageModels.has(model); }

export function estimateModelCost(model: UsageModel, overrides: Record<string, TokenRate> = {}) {
  const measuredCalls = Math.max(0, model.calls - model.unknown);
  if (!measuredCalls) return { usd: null, complete: false, unpricedCalls: model.calls };
  if (isPricedImageModel(model.model)) {
    const text = model.textInput || 0, image = model.imageInput || 0;
    const detailed = Math.min(measuredCalls, model.detailedCalls || 0);
    return { usd: (text * 5 + image * 8 + model.output * 30) / 1e6, complete: model.unknown === 0 && detailed === measuredCalls, unpricedCalls: model.calls - detailed };
  }
  // Unknown models remain explicitly unpriced, never implicitly free.
  const rate = overrides[model.model] || officialTextRates[model.model];
  if (!rate) return { usd: null, complete: false, unpricedCalls: model.calls };
  return { usd: ((model.input - model.cached) * rate.input + model.cached * rate.cached + model.output * rate.output) / 1e6, complete: model.unknown === 0, unpricedCalls: model.unknown };
}

export function estimateUserCost(usage: UsageSummary | null, overrides: Record<string, TokenRate> = {}) {
  const models = Object.values(usage?.models || {}).map(model => estimateModelCost(model, overrides));
  const priced = models.filter(model => model.usd !== null);
  return { usd: priced.length ? priced.reduce((sum, model) => sum + model.usd!, 0) : null, complete: models.length > 0 && models.every(model => model.complete), unpricedCalls: models.reduce((sum, model) => sum + model.unpricedCalls, 0) };
}

export function estimateEventCost(event: UsageEvent, overrides: Record<string, TokenRate> = {}) {
  const detailed = event.textInput !== undefined && event.imageInput !== undefined && event.textInput + event.imageInput === event.input;
  return estimateModelCost({ ...event, calls: 1, unknown: event.measured ? 0 : 1, detailedCalls: detailed ? 1 : 0 }, overrides);
}

export const usdAmount = (value: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 8 }).format(value);

/** The Images API reports the modalities explicitly; do not infer a split. */
export function imageUsageDetails(value: unknown) {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const details = usage.input_tokens_details as Record<string, unknown> | undefined;
  const text = details?.text_tokens, image = details?.image_tokens;
  if (!Number.isSafeInteger(text) || !Number.isSafeInteger(image) || (text as number) < 0 || (image as number) < 0 || (text as number) + (image as number) !== usage.input_tokens) return undefined;
  return { textInput: text as number, imageInput: image as number };
}
