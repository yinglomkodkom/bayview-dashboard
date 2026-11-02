// Runs in the browser: turns a Word file into Markdown with its pictures stored,
// each left where the document has it. Canvas is here to shrink large photos.
import { checkCoverage, figureLabels, nameFigures, tidyCodeHeadings } from "@/lib/pdf-convert";
import { figureName, storeFigure } from "@/lib/figure-store-client";
import { fileIdFromName } from "@/lib/sop-file-id";

const MIN_FIGURE_WIDTH = 100;
const MIN_FIGURE_HEIGHT = 50;
const MAX_FIGURE_SIDE = 2048; // keeps a phone photo under LINE's 1 MB
const REPEATED_TIMES = 3; // the same picture this often is a logo, not content
const IMAGE_SRC = "docx-image:";

interface WordImage {
  base64: string;
  contentType: string;
}

// Word's automatic picture descriptions end with this disclaimer.
const figureMark = (index: number, alt: string) =>
  `![${alt.replace(/\s*AI-generated content may be incorrect\.?/i, "").replace(/[[\]()]/g, " ")}](FIG:img${index})`;

function inlineText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName;
  if (tag === "BR") return "\n";
  if (tag === "IMG") {
    const src = node.getAttribute("src") || "";
    if (!src.startsWith(IMAGE_SRC)) return "";
    return `\n\n${figureMark(Number(src.slice(IMAGE_SRC.length)), node.getAttribute("alt") || "")}\n\n`;
  }
  const inner = [...node.childNodes].map(inlineText).join("");
  if (tag === "A") {
    const href = node.getAttribute("href") || "";
    return /^https?:/.test(href) && inner.trim() ? `[${inner}](${href})` : inner;
  }
  return tag === "P" ? `${inner}\n\n` : inner;
}

function listText(list: Element, depth: number): string {
  const ordered = list.tagName === "OL";
  const items = [...list.children].map((item, i) => {
    const nested = [...item.children].filter((c) => c.tagName === "UL" || c.tagName === "OL");
    const own = [...item.childNodes].filter((c) => !nested.includes(c as Element));
    const text = own.map(inlineText).join("").trim();
    const line = `${"  ".repeat(depth)}${ordered ? `${i + 1}.` : "-"} ${text}`;
    return [line, ...nested.map((n) => listText(n, depth + 1))].join("\n");
  });
  return items.join("\n");
}

/** Mammoth's HTML to the Markdown the chunker reads. */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: string[] = [];

  for (const node of doc.body.childNodes) {
    if (!(node instanceof HTMLElement)) {
      if (node.textContent?.trim()) blocks.push(node.textContent.trim());
      continue;
    }
    const heading = node.tagName.match(/^H([1-6])$/);
    if (heading) {
      // The chunker turns a heading line into a label, which would lose a picture in it.
      const text = inlineText(node);
      const pictures = text.match(/!\[[^\]]*\]\(FIG:\w+\)/g) || [];
      const title = text.replace(/!\[[^\]]*\]\(FIG:\w+\)/g, "").replace(/\s+/g, " ").trim();
      if (title) blocks.push(`${"#".repeat(Math.min(Number(heading[1]), 3))} ${title}`);
      blocks.push(...pictures);
    } else if (node.tagName === "UL" || node.tagName === "OL") {
      blocks.push(listText(node, 0));
    } else if (node.tagName === "TABLE") {
      for (const row of node.querySelectorAll("tr")) {
        const cells = [...row.children].map((cell) => inlineText(cell).replace(/\s*\n\s*/g, " ").trim());
        blocks.push(cells.join(" | "));
      }
    } else {
      const text = inlineText(node).trim();
      if (text) blocks.push(text);
    }
  }
  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n");
}

/** Null for a format the browser cannot draw, such as EMF from older Office versions. */
async function toCanvas(image: WordImage): Promise<HTMLCanvasElement | "too-small" | null> {
  const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: image.contentType }));
  } catch {
    return null;
  }
  if (bitmap.width < MIN_FIGURE_WIDTH || bitmap.height < MIN_FIGURE_HEIGHT) return "too-small";

  const scale = Math.min(1, MAX_FIGURE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Transparent areas would turn black in the LINE image viewer.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export interface DocxConversion {
  markdown: string;
  figureNames: string[];
  /** Pictures in a format that could not be kept. */
  skippedFigures: number;
  /** Lines the Markdown lost, added back from Word's plain text. */
  restoredLines: number;
}

/** Word to Markdown with its pictures stored, ready for /api/documents/upload. */
export async function convertDocx(
  file: File,
  onStep: (message: string) => void
): Promise<DocxConversion> {
  onStep("กำลังอ่านข้อความและรูปใน Word");
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();

  const images: WordImage[] = [];
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        images.push({ base64: await image.read("base64"), contentType: image.contentType });
        return { src: `${IMAGE_SRC}${images.length - 1}` };
      }),
    }
  );

  let markdown = tidyCodeHeadings(htmlToMarkdown(html));
  const { value: plainText } = await mammoth.extractRawText({ arrayBuffer });
  const { missingLines } = checkCoverage(plainText, markdown);
  if (missingLines.length) markdown += `\n\n${missingLines.join("\n")}`;

  const timesUsed = new Map<string, number>();
  for (const image of images) timesUsed.set(image.base64, (timesUsed.get(image.base64) || 0) + 1);

  const fileId = fileIdFromName(file.name);
  const canvases = new Map<string, HTMLCanvasElement>();
  const fileNameOf = new Map<string, string>();
  let skippedFigures = 0;
  for (const label of figureLabels(markdown)) {
    const image = images[Number(label.slice(3))];
    if (!image || (timesUsed.get(image.base64) || 0) >= REPEATED_TIMES) continue;
    const canvas = await toCanvas(image);
    if (canvas === "too-small") continue;
    if (!canvas) {
      skippedFigures++;
      continue;
    }
    canvases.set(label, canvas);
    fileNameOf.set(label, await figureName(fileId, fileNameOf.size + 1, canvas));
  }

  let stored = 0;
  for (const [label, name] of fileNameOf) {
    stored++;
    onStep(`กำลังเก็บรูป ${stored} จาก ${fileNameOf.size}`);
    await storeFigure(name, canvases.get(label)!);
  }

  return {
    markdown: nameFigures(markdown, fileNameOf),
    figureNames: [...fileNameOf.values()],
    skippedFigures,
    restoredLines: missingLines.length,
  };
}
