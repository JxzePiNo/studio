import type { ChatMessage } from "./types";

export type ChatStreamEvent =
  | { event: "material-start"; data: { kind: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "quiz-start"; data: { documentId: string } }
  | { event: "quiz"; data: { quizId: string } }
  | { event: "done"; data: { messages: ChatMessage[]; quizId?: string } }
  | { event: "error"; data: { error: string } };

/** Decode UTF-8 and SSE frames independently of network chunk boundaries. */
export async function readChatStream(response: Response, onEvent: (event: ChatStreamEvent) => void) {
  if (!response.body) throw new Error("Risposta vuota. Riprova.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  const consume = (frame: string) => {
    const lines = frame.split(/\r?\n/);
    const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!event || !data) return;
    if (!["material-start", "delta", "quiz-start", "quiz", "done", "error"].includes(event)) return;
    const parsed = JSON.parse(data);
    if (event === "error") throw new Error(typeof parsed.error === "string" ? parsed.error : "Invio non riuscito. Riprova.");
    if (event === "done") {
      if (!Array.isArray(parsed.messages)) throw new Error("Risposta incompleta. Riprova.");
      done = true;
    }
    onEvent({ event, data: parsed } as ChatStreamEvent);
  };
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let boundary: RegExpExecArray | null;
      while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
        consume(buffer.slice(0, boundary.index));
        buffer = buffer.slice(boundary.index + boundary[0].length);
      }
      if (chunk.done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (!done) throw new Error("La risposta è stata interrotta. Riprova.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
