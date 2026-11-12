import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { ChatMessage } from "../lib/types";

for (const width of [1280, 390]) test(`streaming and saving a reply preserve its reading position at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const folder = await (await request.post("/api/folders", { data: { name: `Lettura chat ${Date.now()}` } })).json();
  const doc = await (await request.post("/api/documents", { multipart: { folderId: folder.id, file: { name: "Lezione.pdf", mimeType: "application/pdf", buffer: await readFile("public/esempio.pdf") } } })).json();
  const history: ChatMessage[] = [{ role: "user", content: "Domanda precedente" }, { role: "assistant", content: Array.from({ length: 20 }, (_, i) => `Contesto precedente ${i + 1}: un concetto da ricordare.`).join("\n\n") }];
  const first = Array.from({ length: 60 }, (_, i) => `Passaggio ${i + 1}: questa spiegazione arriva progressivamente e si può leggere con calma.`).join("\n\n");
  const tail = "\n\n" + Array.from({ length: 45 }, (_, i) => `Approfondimento ${i + 1}: la generazione prosegue sotto il punto che stai leggendo.`).join("\n\n");
  await page.route("**/api/status", route => route.fulfill({ json: { configured: true } }));
  await page.route(`**/api/documents/${doc.id}`, async route => {
    if (route.request().method() !== "GET") return route.fallback();
    const response = await route.fetch(); const data = await response.json();
    data.slides[1] = { ...data.slides[1], chat: history };
    return route.fulfill({ json: data });
  });
  await page.addInitScript(({ id, first, tail, history }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith(`/api/documents/${id}/chat`) || init?.method !== "POST") return originalFetch(input, init);
      const body = JSON.parse(String(init.body));
      const encoder = new TextEncoder();
      const stream = new ReadableStream({ start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        send("delta", { text: first });
        window.addEventListener("studio-test-more-reply", () => send("delta", { text: tail }), { once: true });
        window.addEventListener("studio-test-finish-reply", () => {
          send("done", { messages: [...history, { role: "user", content: body.question }, { role: "assistant", content: first + tail }] });
          controller.close();
        }, { once: true });
      } });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    };
  }, { id: doc.id, first, tail, history });
  try {
    await page.goto(`/esami/${folder.id}/documenti/${doc.id}`);
    await expect(page.locator(".slide-stage canvas")).toBeVisible();
    if (width < 700) await page.getByRole("button", { name: "Apri chat con Tony", exact: true }).click();
    const question = page.getByRole("textbox", { name: "Domanda al tutor", exact: true });
    await question.fill("Spiegami il procedimento con tutti i passaggi.");
    await page.getByRole("button", { name: "Invia domanda", exact: true }).click();
    await expect(page.locator(".chat-message.is-streaming")).toContainText("Passaggio 60");
    const area = page.locator(".chat-scroll-area");
    const position = await area.evaluate(element => {
      const answer = element.querySelector(".is-streaming")!;
      const top = answer.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop + 150;
      element.scrollTo({ top, behavior: "instant" });
      return element.scrollTop;
    });
    await page.evaluate(() => window.dispatchEvent(new Event("studio-test-more-reply")));
    await expect(page.locator(".chat-message.is-streaming")).toContainText("Approfondimento 45");
    expect(Math.abs(await area.evaluate(element => element.scrollTop) - position)).toBeLessThan(2);
    await page.evaluate(() => window.dispatchEvent(new Event("studio-test-finish-reply")));
    await expect(page.locator(".chat-message.is-streaming")).toHaveCount(0);
    await expect(question).toBeEnabled();
    await expect(question).toHaveValue("");
    await expect.poll(() => area.evaluate(element => element.scrollTop)).toBeCloseTo(position, 0);
    expect(await area.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeGreaterThan(300);
    await expect(question).not.toBeFocused();
  } finally { await request.delete(`/api/folders/${folder.id}`); }
});
