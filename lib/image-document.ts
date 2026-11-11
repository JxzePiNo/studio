import { PDFDocument } from "pdf-lib";

/** Keep images in the same document pipeline used by reading, chat and quizzes. */
export async function imageDocument(bytes: Uint8Array, format: "png" | "jpeg"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const image = format === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const page = pdf.addPage([image.width, image.height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  return pdf.save();
}
