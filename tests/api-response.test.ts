import assert from "node:assert/strict";
import test from "node:test";
import { ApiResponseError, readApiResponse } from "../lib/api-response";

function response(body: string | null, status: number) {
  const result = new Response(body, { status });
  Object.defineProperty(result, "url", { value: "https://studio.example/api/documents?private=hidden" });
  return result;
}

test("API responses preserve successful data and useful JSON errors", async () => {
  assert.deepEqual(await readApiResponse(response('[{"id":"document"}]', 200)), [{ id: "document" }]);
  await assert.rejects(readApiResponse(response('{"error":"Sessione scaduta."}', 401)), error => error instanceof ApiResponseError && error.status === 401 && error.message.includes("Sessione scaduta.") && error.endpoint === "/api/documents");
});

test("empty, HTML and truncated responses report status and endpoint without leaking content", async () => {
  for (const [body, status] of [[null, 502], ["<html>SECRET_STACK_TRACE</html>", 500], ['{"id":', 200], [null, 200]] as const) {
    await assert.rejects(readApiResponse(response(body, status)), error => error instanceof ApiResponseError
      && error.status === status && error.message.includes("/api/documents")
      && !error.message.includes("SECRET_STACK_TRACE") && !error.message.includes("private=hidden"));
  }
});

test("hosting upload and timeout failures receive actionable explanations", async () => {
  await assert.rejects(readApiResponse(response("FUNCTION_PAYLOAD_TOO_LARGE", 413)), /limite di caricamento.*HTTP 413/);
  await assert.rejects(readApiResponse(response(null, 504)), /tempo massimo.*HTTP 504/);
});
