import { randomUUID } from "node:crypto";
import { cloudEnabled, services, userId } from "./firebase-server";
import { imageUsageDetails } from "./openai-pricing";

export function usageNumbers(value: unknown) {
  const usage = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  const integer = (value: unknown) => validCount(value) ? value : 0;
  const input = integer(usage.input_tokens), output = integer(usage.output_tokens);
  const cached = Math.min(input, integer((usage.input_tokens_details as Record<string, unknown> | undefined)?.cached_tokens));
  return { input, output, cached, total: input + output, measured: validCount(usage.input_tokens) && validCount(usage.output_tokens) };
}
export function tokenCost(usage: { input: number; output: number; cached: number }, rates?: { input: number; cached: number; output: number }) {
  return rates ? ((usage.input - usage.cached) * rates.input + usage.cached * rates.cached + usage.output * rates.output) / 1_000_000 : null;
}

/** Provider-reported usage, including rejected/incomplete output, never prompt estimates. */
export function meteredFetch(feature: string): typeof fetch {
  return async (input, init) => {
    const started = Date.now(), eventId = randomUUID();
    const nativeFetch = globalThis.fetch;
    if (!cloudEnabled()) return nativeFetch(input, init);
    const uid = await userId();
    let requestedModel = "unknown";
    try { requestedModel = JSON.parse(String(init?.body)).model || requestedModel; } catch {}
    const record = async (payload: Record<string, unknown>, status: string, httpStatus: number) => {
      try {
        const model = typeof payload.model === "string" ? payload.model : requestedModel;
        const usage = usageNumbers(payload.usage);
        const modalities = imageUsageDetails(payload.usage);
        const root = services().db.collection("users").doc(uid);
        const responseId = typeof payload.id === "string" ? payload.id : null;
        const id = responseId && /^[a-zA-Z0-9_-]{1,150}$/.test(responseId) ? responseId : eventId;
        const event = root.collection("usageEvents").doc(id), metrics = root.collection("metrics").doc("usage");
        await services().db.runTransaction(async tx => {
          const [existing, aggregate] = await Promise.all([tx.get(event), tx.get(metrics)]);
          if (existing.exists) return;
          const before = aggregate.data() || {};
          const models = { ...(before.models || {}) };
          // Store model names as array entries rather than Firestore field paths.
          const key = Buffer.from(model).toString("base64url");
          const previous = models[key] || { model, input: 0, output: 0, cached: 0, total: 0, calls: 0, unknown: 0 };
          models[key] = { ...previous, model, input: previous.input + usage.input, output: previous.output + usage.output, cached: previous.cached + usage.cached, total: previous.total + usage.total, calls: previous.calls + 1, unknown: previous.unknown + Number(!usage.measured), ...(modalities && usage.measured ? { textInput: (previous.textInput || 0) + modalities.textInput, imageInput: (previous.imageInput || 0) + modalities.imageInput, detailedCalls: (previous.detailedCalls || 0) + 1 } : {}) };
          const at = new Date().toISOString();
          tx.create(event, { feature, model, ...usage, ...(modalities || {}), status, httpStatus, responseId, at, durationMs: Date.now() - started });
          tx.set(metrics, { models, calls: (before.calls || 0) + 1, errors: (before.errors || 0) + Number(status !== "completed"), firstRecordedAt: before.firstRecordedAt || at, lastRecordedAt: at });
        });
      } catch (error) { console.error("AI metering write failed", { uid, feature, error: error instanceof Error ? error.message : "unknown" }); }
    };
    let response: Response;
    try { response = await nativeFetch(input, init); }
    catch (error) { await record({}, "connection-error", 0); throw error; }
    return meterResponse(response, record);
  };
}

export async function meterResponse(response: Response, record: (payload: Record<string, unknown>, status: string, httpStatus: number) => Promise<void>): Promise<Response> {
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      const value = await response.clone().json().catch(() => ({}));
      const payload = value && typeof value === "object" ? value : {};
      await record(payload, response.ok ? payload.status || "completed" : "error", response.status);
      return response;
    }
    if (!response.body) return response;
    let buffer = "", recorded = false; const decoder = new TextDecoder();
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      async transform(chunk, controller) {
        buffer = (buffer + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, "\n");
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
          try {
            const event = JSON.parse(data);
            if (["response.completed", "response.incomplete", "response.failed"].includes(event.type)) { await record(event.response || {}, event.response?.status || "failed", response.status); recorded = true; }
          } catch {}
        }
        if (buffer.length > 2_000_000) buffer = "";
        controller.enqueue(chunk);
      },
      async flush() { if (!recorded) await record({}, "interrupted-usage-unavailable", response.status); },
    }));
    const reader = body.getReader();
    const output = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try { const chunk = await reader.read(); if (chunk.done) controller.close(); else controller.enqueue(chunk.value); }
        catch (error) { if (!recorded) { await record({}, "interrupted-usage-unavailable", response.status); recorded = true; } controller.error(error); }
      },
      async cancel(reason) { if (!recorded) { await record({}, "cancelled-usage-unavailable", response.status); recorded = true; } await reader.cancel(reason); },
    });
    return new Response(output, { status: response.status, headers: response.headers });
}
