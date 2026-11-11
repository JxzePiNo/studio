import { PDFDocument } from "pdf-lib";
import { imageDocument } from "./image-document";
import { MAX_UPLOAD_BYTES, uploadFormat } from "./upload-formats";

export async function prepareUpload(originalName: string, input: Uint8Array) {
  const invalid = (message: string) => Object.assign(new Error(message), { status: 400 });
  const format = uploadFormat(originalName);
  if (!format) throw invalid("Scegli un PDF o un'immagine PNG o JPEG.");
  if (!input.length || input.length > MAX_UPLOAD_BYTES) throw invalid("Il file deve avere una dimensione compresa tra 1 byte e 500 MB.");
  let bytes = input;
  if (format !== "pdf") {
    try { bytes = await imageDocument(bytes, format); }
    catch { throw invalid("L'immagine non è leggibile. Scegli un file PNG o JPEG valido."); }
  }
  let pdf: PDFDocument;
  try { pdf = await PDFDocument.load(bytes); }
  catch { throw invalid("Il PDF non è leggibile o è protetto da password."); }
  const pages = pdf.getPageCount();
  if (pages < 1 || pages > 1000) throw invalid("Sono supportati PDF da 1 a 1.000 pagine.");
  const name = (format === "pdf" ? originalName : originalName.replace(/\.[^.]+$/, ".pdf")).replace(/[\x00-\x1f]/g, "").slice(0, 200);
  return { name, bytes, pages };
}
