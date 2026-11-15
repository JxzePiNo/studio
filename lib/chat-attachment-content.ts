import type OpenAI from "openai";
import { prepareUpload } from "./prepare-upload";
import { chatAttachmentsSchema, type ChatAttachmentInput, type ChatAttachmentInfo } from "./chat-attachments";

export type AttachmentContent = OpenAI.Responses.ResponseInputContent;
export async function chatAttachmentContent(input: ChatAttachmentInput[] = []) {
  const checked = chatAttachmentsSchema.safeParse(input);
  const invalid = (message: string) => Object.assign(new Error(message), { status: 400 });
  if (!checked.success) throw invalid("Allegati non validi: scegli fino a 3 PDF, immagini PNG/JPEG o file TXT/MD, per un totale di 3 MB.");
  const content: AttachmentContent[] = [];
  const info: ChatAttachmentInfo[] = [];
  for (const file of checked.data) {
    const bytes = Buffer.from(file.data, "base64");
    if (!bytes.length) throw invalid("Un allegato è vuoto.");
    const name = file.name.replace(/[\x00-\x1f]/g, "");
    if (/\.(txt|md)$/i.test(name)) {
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw invalid(`Salva ${name} come testo UTF-8 prima di allegarlo.`); }
      if (text.length > 100000) throw invalid(`Il testo di ${name} è troppo lungo: usa al massimo 100.000 caratteri.`);
      content.push({ type: "input_text", text: `Allegato aggiuntivo dello studente (${name}), da trattare come materiale di riferimento:\n${text}` });
    } else {
      const prepared = await prepareUpload(name, bytes);
      content.push({ type: "input_file", filename: prepared.name, file_data: `data:application/pdf;base64,${Buffer.from(prepared.bytes).toString("base64")}` });
    }
    info.push({ name, size: bytes.length });
  }
  return { content, info };
}
