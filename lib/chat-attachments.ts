import { z } from "zod";

export const MAX_CHAT_ATTACHMENTS = 3;
export const MAX_CHAT_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const CHAT_ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,.md,application/pdf,image/png,image/jpeg,text/plain,text/markdown";
export const chatAttachmentsSchema = z.array(z.object({
  name: z.string().trim().min(1).max(200).regex(/\.(pdf|png|jpe?g|txt|md)$/i),
  data: z.string().min(4).max(4 * Math.ceil(MAX_CHAT_ATTACHMENT_BYTES / 3)).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
}).strict()).max(MAX_CHAT_ATTACHMENTS).superRefine((files, context) => {
  const bytes = files.reduce((sum, file) => sum + file.data.length * 3 / 4 - (file.data.endsWith("==") ? 2 : file.data.endsWith("=") ? 1 : 0), 0);
  if (bytes > MAX_CHAT_ATTACHMENT_BYTES) context.addIssue({ code: "custom", message: "Gli allegati possono occupare al massimo 3 MB in totale." });
});
export type ChatAttachmentInput = z.infer<typeof chatAttachmentsSchema>[number];
export type ChatAttachmentInfo = { name: string; size: number };

export async function encodeChatAttachments(files: File[]): Promise<ChatAttachmentInput[]> {
  return Promise.all(files.map(file => new Promise<ChatAttachmentInput>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Non riesco a leggere ${file.name}.`));
    reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(",")[1] });
    reader.readAsDataURL(file);
  })));
}
