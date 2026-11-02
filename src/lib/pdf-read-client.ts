// Runs in the browser: pulls the text, links and pictures out of a PDF and has
// the server turn it into Markdown batch by batch. Doing this here means no
// server time limit, and canvas works the same on Vercel and Cloudflare.
import {
  PDF_PAGES_PER_BATCH,
  checkCoverage,
  figureLabels,
  nameFigures,
  removeUnknownUrls,
  stripFence,
  tidyCodeHeadings,
} from "@/lib/pdf-convert";
import { figurePrefix, fileIdFromName } from "@/lib/sop-file-id";

// Copied from node_modules/pdfjs-dist/build into public/ so both hosts serve it
// the same way. Keep it in step with the pdfjs-dist version in package.json.
const PDF_WORKER_URL = "/pdf.worker.min.mjs";

const MIN_FIGURE_WIDTH = 100;
const MIN_FIGURE_HEIGHT = 50;
const PREVIEW_MAX_SIDE = 768;
const MAX_STORED_BYTES = 1024 * 1024; // LINE's limit for a preview image
const REPEATED_ON_PAGES = 3; // the same picture this often is a logo, not content
const GOOD_COVERAGE = 97;

interface PdfFigure {
  label: string;
  page: number;
  canvas: HTMLCanvasElement;
}

interface PdfContent {
  pageCount: number;
  pageText: string[];
  pageLinks: string[][];
  figures: PdfFigure[];
}

interface DecodedImage {
  width: number;
  height: number;
  kind?: number;
  data?: Uint8ClampedArray;
  bitmap?: ImageBitmap;
}

function toCanvas(image: DecodedImage): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Transparent areas would turn black in the LINE image viewer.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (image.bitmap) {
    ctx.drawImage(image.bitmap, 0, 0);
    return canvas;
  }
  if (!image.data) return null;

  const pixels = ctx.createImageData(image.width, image.height);
  const out = pixels.data;
  const data = image.data;
  if (image.kind === 3) {
    out.set(data);
  } else if (image.kind === 2) {
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      out[j] = data[i];
      out[j + 1] = data[i + 1];
      out[j + 2] = data[i + 2];
      out[j + 3] = 255;
    }
  } else {
    return null; // 1-bit masks are never photos or screenshots
  }
  const layer = document.createElement("canvas");
  layer.width = image.width;
  layer.height = image.height;
  layer.getContext("2d")?.putImageData(pixels, 0, 0);
  ctx.drawImage(layer, 0, 0);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("แปลงรูปไม่สำเร็จ"))), type, quality);
  });
}

async function readPdf(file: File): Promise<PdfContent> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;

  const pageText: string[] = [];
  const pageLinks: string[][] = [];
  const found: (PdfFigure & { fingerprint: string })[] = [];

  for (let num = 1; num <= pdf.numPages; num++) {
    const page = await pdf.getPage(num);

    const content = await page.getTextContent();
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      text += item.str + (item.hasEOL ? "\n" : "");
    }
    pageText.push(text);

    const annotations = await page.getAnnotations();
    pageLinks.push(
      [...new Set(annotations.map((a) => a.url as string | undefined).filter((u): u is string => Boolean(u)))]
    );

    const ops = await page.getOperatorList();
    const seenOnPage = new Set<string>();
    let index = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
      const name = ops.argsArray[i][0] as string;
      if (seenOnPage.has(name)) continue;
      seenOnPage.add(name);

      const store = name.startsWith("g_") ? page.commonObjs : page.objs;
      const image = await new Promise<DecodedImage>((resolve) => store.get(name, resolve));
      if (!image || image.width < MIN_FIGURE_WIDTH || image.height < MIN_FIGURE_HEIGHT) continue;

      const canvas = toCanvas(image);
      if (!canvas) continue;
      index++;
      found.push({
        label: `p${num}_${index}`,
        page: num,
        canvas,
        fingerprint: `${image.width}x${image.height}:${canvas.toDataURL("image/jpeg", 0.3).length}`,
      });
    }
  }

  const pagesWith = new Map<string, Set<number>>();
  for (const f of found) {
    pagesWith.set(f.fingerprint, (pagesWith.get(f.fingerprint) || new Set()).add(f.page));
  }
  const figures = found.filter((f) => (pagesWith.get(f.fingerprint)?.size || 0) < REPEATED_ON_PAGES);

  return { pageCount: pdf.numPages, pageText, pageLinks, figures };
}

function preview(canvas: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, PREVIEW_MAX_SIDE / Math.max(canvas.width, canvas.height));
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
  return toBlob(small, "image/jpeg", 0.75);
}

async function convertBatch(
  file: File,
  fromPage: number,
  toPage: number,
  totalPages: number,
  links: string[],
  figures: PdfFigure[],
  missingLines: string[]
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("from_page", String(fromPage));
  form.append("to_page", String(toPage));
  form.append("total_pages", String(totalPages));
  form.append("links", JSON.stringify(links));
  form.append("missing_lines", JSON.stringify(missingLines));
  for (const figure of figures) {
    form.append(`fig:${figure.label}`, await preview(figure.canvas), `${figure.label}.jpg`);
  }
  const res = await fetch("/api/documents/convert", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!data?.success) throw new Error(data?.error || `อ่าน PDF ไม่สำเร็จ (HTTP ${res.status})`);
  return stripFence(data.markdown);
}

async function storeFigure(name: string, canvas: HTMLCanvasElement): Promise<void> {
  const form = new FormData();
  form.append("name", name);
  form.append("image", await figureFile(name, canvas), name);
  const res = await fetch("/api/documents/figure", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!data?.success) throw new Error(data?.error || `เก็บรูปไม่สำเร็จ (HTTP ${res.status})`);
}

async function figureFile(name: string, canvas: HTMLCanvasElement): Promise<Blob> {
  if (name.endsWith(".png")) return toBlob(canvas, "image/png");
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob.size <= MAX_STORED_BYTES) return blob;
  }
  throw new Error("รูปในไฟล์ใหญ่เกิน 1 MB");
}

export interface PdfConversion {
  markdown: string;
  figureNames: string[];
  pageCount: number;
  /** Share of the PDF's text layer found in the Markdown, before lines were put back. */
  coveragePercent: number;
  /** Lines Gemini still lost after a retry; added back as the PDF had them. */
  restoredLines: number;
  removedUrls: string[];
}

/** PDF to Markdown with its pictures stored, ready for /api/documents/upload. */
export async function convertPdf(
  file: File,
  onStep: (message: string) => void
): Promise<PdfConversion> {
  onStep("กำลังอ่านข้อความและรูปใน PDF");
  const pdf = await readPdf(file);

  const sections: string[] = [];
  let sourceChars = 0;
  let coveredChars = 0;
  let restoredLines = 0;
  const removedUrls: string[] = [];

  for (let from = 1; from <= pdf.pageCount; from += PDF_PAGES_PER_BATCH) {
    const to = Math.min(from + PDF_PAGES_PER_BATCH - 1, pdf.pageCount);
    onStep(`กำลังแปลงหน้า ${from}-${to} จาก ${pdf.pageCount}`);
    const source = pdf.pageText.slice(from - 1, to).join("\n");
    const links = [...new Set(pdf.pageLinks.slice(from - 1, to).flat())];
    const figures = pdf.figures.filter((f) => f.page >= from && f.page <= to);

    let markdown = await convertBatch(file, from, to, pdf.pageCount, links, figures, []);
    let coverage = checkCoverage(source, markdown);
    if (coverage.percent < GOOD_COVERAGE) {
      onStep(`กำลังตรวจหน้า ${from}-${to} ซ้ำ เพราะข้อความไม่ครบ`);
      const retry = await convertBatch(file, from, to, pdf.pageCount, links, figures, coverage.missingLines);
      const retryCoverage = checkCoverage(source, retry);
      if (retryCoverage.percent >= coverage.percent) {
        markdown = retry;
        coverage = retryCoverage;
      }
    }

    const weight = source.length;
    sourceChars += weight;
    coveredChars += (weight * coverage.percent) / 100;

    // Whatever is still missing goes back in the PDF's own spelling: a damaged
    // line can still be found by search, a lost one cannot.
    if (coverage.missingLines.length) {
      restoredLines += coverage.missingLines.length;
      markdown += `\n\n${coverage.missingLines.join("\n")}`;
    }

    const urls = removeUnknownUrls(markdown, source, links);
    removedUrls.push(...urls.removed);
    sections.push(urls.text);
  }

  const joined = tidyCodeHeadings(sections.join("\n\n"));
  const fileId = fileIdFromName(file.name);
  const labels = figureLabels(joined);
  const byLabel = new Map(pdf.figures.map((f) => [f.label, f]));
  const usable = labels.filter((label) => byLabel.has(label));

  const fileNameOf = new Map<string, string>();
  for (const [i, label] of usable.entries()) {
    const canvas = byLabel.get(label)!.canvas;
    const number = String(i + 1).padStart(2, "0");
    const png = (await toBlob(canvas, "image/png")).size <= MAX_STORED_BYTES;
    fileNameOf.set(label, `${figurePrefix(fileId)}${number}.${png ? "png" : "jpg"}`);
  }

  let stored = 0;
  for (const [label, name] of fileNameOf) {
    stored++;
    onStep(`กำลังเก็บรูป ${stored} จาก ${fileNameOf.size}`);
    await storeFigure(name, byLabel.get(label)!.canvas);
  }

  return {
    markdown: nameFigures(joined, fileNameOf),
    figureNames: [...fileNameOf.values()],
    pageCount: pdf.pageCount,
    coveragePercent: sourceChars ? Math.round((coveredChars / sourceChars) * 1000) / 10 : 100,
    restoredLines,
    removedUrls: [...new Set(removedUrls)],
  };
}
