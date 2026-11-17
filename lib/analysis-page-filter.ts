import type { Explanation } from "./types";
import { classifyOcrPage } from "./analysis-ocr-filter";

/** Inspect only the extracted single page. Unknown drawing operations and extraction
 * failures always fall through to the normal visual analysis. No provider calls. */
export async function filterAnalysisPage(bytes: Uint8Array): Promise<Explanation | undefined> {
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: true, isEvalSupported: false, verbosity: 0 });
  try {
    const pdf = await loading.promise;
    if (pdf.numPages !== 1) return;
    const page = await pdf.getPage(1);
    const [content, operators, annotations] = await Promise.all([page.getTextContent(), page.getOperatorList(), page.getAnnotations()]);
    // Even an annotation can contain a diagram or other useful information.
    if (annotations.length) return;
    if (!content.items.some(item => "str" in item && item.str.trim())
      && operators.fnArray.some(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].includes(op))) {
      const { localPageOcr } = await import("./local-page-ocr");
      const recognized = await localPageOcr(page);
      return recognized ? classifyOcrPage(recognized) : undefined;
    }
    const safeNames = [
      "dependency", "save", "restore", "transform", "beginText", "endText",
      "setCharSpacing", "setWordSpacing", "setHScale", "setLeading", "setFont",
      "setTextRise", "moveText", "setLeadingMoveText", "setTextMatrix", "nextLine",
      "showText", "showSpacedText", "nextLineShowText", "nextLineSetSpacingShowText",
      "setFillGray", "setFillRGBColor", "setFillCMYKColor", "setStrokeGray",
      "setStrokeRGBColor", "setStrokeCMYKColor", "beginMarkedContent",
      "beginMarkedContentProps", "endMarkedContent", "markPoint", "markPointProps",
    ];
    const safe = new Set(safeNames.map(name => OPS[name as keyof typeof OPS]));
    if (operators.fnArray.some(op => !safe.has(op))) return;
    const items = content.items.filter(item => "str" in item);
    const lines: { text: string; height: number; y: number }[] = [];
    for (const item of items) {
      if (!item.str.trim()) continue;
      const y = item.transform[5];
      const last = lines.at(-1);
      if (last && Math.abs(last.y - y) < 2) {
        last.text += ` ${item.str}`;
        last.height = Math.min(last.height, item.height);
      } else lines.push({ text: item.str.trim(), height: item.height, y });
    }
    const result = (kind: "title" | "index" | "blank", title: string, overview: string): Explanation => ({
      pageKind: kind, title: title.slice(0, 300), language: "other", overview,
      concepts: [], glossary: [], example: "", takeaway: "",
    });
    if (!lines.length) {
      // Missing extraction must not turn scanned or unrecognized text into blank pages.
      if (operators.fnArray.some(op => [OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText].includes(op))) return;
      return result("blank", "Pagina bianca", "Pagina priva di contenuti da analizzare.");
    }
    const heading = lines[0].text;
    const isPageNumber = (line: typeof lines[number]) => /^\d+$/.test(line.text)
      && line.height <= 14 && line.y < page.view[1] + (page.view[3] - page.view[1]) * 0.12;
    const body = lines.slice(1).filter(line => !isPageNumber(line));
    if (/^(indice|sommario|table of contents|contents)\s*$/i.test(heading)
      && body.length >= 3 && body.every(line => line.text.length <= 160 && /^.+?(?:\.{2,}|\s)\s*\d{1,4}\s*$/.test(line.text))) {
      return result("index", heading, "Indice del documento; gli argomenti saranno analizzati nelle pagine corrispondenti.");
    }
    const titles = lines.filter(line => !isPageNumber(line));
    const text = titles.map(line => line.text).join(" ");
    if (titles.length >= 1 && titles.length <= 2 && titles.every(line => line.height >= 24)
      && text.length <= 140 && text.split(/\s+/).length <= 12
      && /^[\p{L}\s'’,:–—-]+$/u.test(text)) {
      return result("title", text, "Pagina con solo titolo o separatore di sezione.");
    }
  } catch {
    // A failed optimization must never suppress content or block normal analysis.
    return;
  } finally {
    await loading.destroy().catch(() => {});
  }
}
