import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { chatAttachmentContent } from "../lib/chat-attachment-content";
import { chatAttachmentsSchema, MAX_CHAT_ATTACHMENT_BYTES } from "../lib/chat-attachments";

test("chat attachments validate readable files and provide PDF and text context without storing their bytes in messages", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage();
  const result = await chatAttachmentContent([{ name: "Appunti.pdf", data: Buffer.from(await pdf.save()).toString("base64") }, { name: "Formule.txt", data: Buffer.from("Energia: E = mc²").toString("base64") }]);
  assert.equal(result.content.length, 2); assert.equal(result.content[0].type, "input_file");
  assert.match((result.content[1] as { text: string }).text, /E = mc²/);
  assert.deepEqual(Object.keys(result.info[0]).sort(), ["name", "size"]);
  await assert.rejects(chatAttachmentContent([{ name: "Falso.pdf", data: Buffer.from("not a PDF").toString("base64") }]), { status: 400 });
  await assert.rejects(chatAttachmentContent([{ name: "Testo.txt", data: Buffer.from([255, 255]).toString("base64") }]), { status: 400 });
});
test("chat attachments reject oversized batches, unsupported files and invalid base64", () => {
  const file = { name: "Note.md", data: "YWJj" };
  assert.equal(chatAttachmentsSchema.safeParse([file, file, file, file]).success, false);
  assert.equal(chatAttachmentsSchema.safeParse([{ ...file, name: "script.exe" }]).success, false);
  assert.equal(chatAttachmentsSchema.safeParse([{ ...file, data: "%%%=" }]).success, false);
  const large = { ...file, data: Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES / 2 + 1).toString("base64") };
  assert.equal(chatAttachmentsSchema.safeParse([large, large]).success, false);
});
