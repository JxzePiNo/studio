export interface CostEntry { day: string; service: string; currency: string; amount: number }
export interface ProviderCosts {
  status: "ready" | "setup" | "error";
  source: string;
  scope: string;
  message: string;
  entries: CostEntry[];
  updatedAt: string | null;
}
export interface AdminCostsReport { start: string; end: string; openai: ProviderCosts; firebase: ProviderCosts }
