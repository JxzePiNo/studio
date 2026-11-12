import test from "node:test";
import assert from "node:assert/strict";
import { meterResponse, tokenCost, usageNumbers } from "../lib/ai-metering";

test("usage counts cache as a subset of input, preserves missing usage and computes configured costs", () => {
  const usage = usageNumbers({ input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 400 } });
  assert.deepEqual(usage, { input: 1000, output: 200, cached: 400, total: 1200, measured: true });
  assert.equal(tokenCost(usage, { input: 2, cached: 1, output: 8 }), 0.0032);
  assert.equal(tokenCost(usage), null);
  assert.equal(usageNumbers(null).measured, false);
  assert.equal(usageNumbers({ input_tokens: 5, output_tokens: 3, input_tokens_details: { cached_tokens: 100 } }).cached, 5);
});

test("non-streaming metering preserves provider payload and captures usage even for incomplete responses", async () => {
  const events: { payload: Record<string, unknown>; status: string }[] = [];
  const input = { id: "resp-one", status: "incomplete", usage: { input_tokens: 42, output_tokens: 8 }, output: [] };
  const response = await meterResponse(Response.json(input), async (payload, status) => { events.push({ payload, status }); });
  assert.deepEqual(await response.json(), input); assert.equal(events[0].status, "incomplete"); assert.deepEqual(events[0].payload.usage, input.usage);
  await meterResponse(Response.json(null), async (payload, status) => { assert.deepEqual(payload, {}); assert.equal(status, "completed"); });
});

test("stream metering decodes split UTF-8 chunks without altering bytes, records completion and incomplete EOF", async () => {
  const text = `event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Città"}\n\nevent: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { id: "stream-one", status: "completed", usage: { input_tokens: 100, output_tokens: 20 } } })}\n\n`;
  const bytes = new TextEncoder().encode(text), stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const events: string[] = [];
  const response = await meterResponse(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }), async (payload, status) => { events.push(status); assert.equal((payload.usage as { input_tokens: number }).input_tokens, 100); });
  assert.equal(await response.text(), text); assert.deepEqual(events, ["completed"]);
  const crlf = text.replace(/\n/g, "\r\n"), crlfEvents: string[] = [];
  const crlfStream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of new TextEncoder().encode(crlf)) controller.enqueue(new Uint8Array([byte])); controller.close(); } });
  const crlfResponse = await meterResponse(new Response(crlfStream, { headers: { "Content-Type": "text/event-stream" } }), async (_, status) => { crlfEvents.push(status); });
  assert.equal(await crlfResponse.text(), crlf); assert.deepEqual(crlfEvents, ["completed"]);
  const interrupted: string[] = [];
  const partial = await meterResponse(new Response("data: {\"type\":\"response.output_text.delta\"}\n\n", { headers: { "Content-Type": "text/event-stream" } }), async (_, status) => { interrupted.push(status); });
  await partial.text(); assert.deepEqual(interrupted, ["interrupted-usage-unavailable"]);
  const cancelled: string[] = [];
  const pending = await meterResponse(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("data: {}\n\n")); } }), { headers: { "Content-Type": "text/event-stream" } }), async (_, status) => { cancelled.push(status); });
  await pending.body!.cancel(); assert.deepEqual(cancelled, ["cancelled-usage-unavailable"]);
});
