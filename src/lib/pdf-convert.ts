// Checks on the Markdown Gemini writes from a PDF. Nothing here calls a service,
// so the browser and the server can share it.
//
// The text layer of a Thai PDF is damaged (สระอำ is lost: "ทาการ" for "ทำการ"),
// which is why Gemini reads the page instead. The text layer still has every
// line in it, so it is the reference for what must not go missing.

/** Pages sent per request, so a long manual never meets the function time limit. */
export const PDF_PAGES_PER_BATCH = 6;

/**
 * Consonants, Latin letters and digits only. Vowels, tone marks and spacing are
 * exactly what differs between the damaged text layer and the corrected Markdown.
 */
export function comparable(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9ก-ฮ]/g, "");
}

const WINDOW = 8;

function isCovered(line: string, target: string): boolean {
  let hits = 0;
  let tries = 0;
  for (let i = 0; i + WINDOW <= line.length; i += WINDOW / 2) {
    tries++;
    if (target.includes(line.slice(i, i + WINDOW))) hits++;
  }
  if (tries === 0) return target.includes(line);
  return hits / tries >= 0.6;
}

export interface CoverageResult {
  /** Share of the source characters found in the Markdown, 0-100. */
  percent: number;
  missingLines: string[];
}

/** Which lines of the PDF's text layer did not reach the Markdown. */
export function checkCoverage(sourceText: string, markdown: string): CoverageResult {
  const target = comparable(markdown);
  const missingLines: string[] = [];
  let total = 0;
  let found = 0;
  for (const raw of sourceText.split("\n")) {
    const line = comparable(raw);
    if (line.length < 4) continue; // page numbers and stray marks
    total += line.length;
    if (isCovered(line, target)) found += line.length;
    else missingLines.push(raw.trim());
  }
  return { percent: total ? Math.round((found / total) * 1000) / 10 : 100, missingLines };
}

const cleanUrl = (url: string) => url.toLowerCase().replace(/[.,;:]+$/, "").replace(/\/+$/, "");

/**
 * Gemini gave one link in the Aruba manual the address of a different link, so a
 * URL stays only if the PDF really has it, in its text or as a clickable link.
 * A wrong link keeps its words and loses the address.
 */
export function removeUnknownUrls(
  markdown: string,
  sourceText: string,
  links: string[]
): { text: string; removed: string[] } {
  const source = sourceText.replace(/\s+/g, "").toLowerCase();
  const known = new Set(links.map(cleanUrl));
  const isKnown = (url: string) => known.has(cleanUrl(url)) || source.includes(cleanUrl(url));
  const removed: string[] = [];
  const reject = (url: string) => {
    removed.push(url);
    return "";
  };
  const text = markdown
    .replace(/(?<!!)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (whole, label: string, url: string) =>
      isKnown(url) ? whole : label + reject(url)
    )
    .replace(/(^|[^(\w])(https?:\/\/[^\s)<>\]"']+)/g, (whole, before: string, url: string) =>
      isKnown(url) ? whole : before + reject(url)
    );
  return { text, removed };
}

const FIGURE = /!\[([^\]]*)\]\(FIG:([A-Za-z0-9_]+)\)/g;

/** Labels the Markdown uses, in reading order, each once. */
export function figureLabels(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(FIGURE)].map((m) => m[2]))];
}

/**
 * Swaps Gemini's FIG:p3_2 labels for the stored file names, numbered in reading
 * order. A label used twice or not on the list is dropped. match_documents then
 * shows these to the bot as [รูปประกอบ IMG:...], the same as the older manuals.
 */
export function nameFigures(markdown: string, fileNameOf: Map<string, string>): string {
  const seen = new Set<string>();
  let number = 0;
  return markdown.replace(FIGURE, (_, caption: string, label: string) => {
    const file = fileNameOf.get(label);
    if (!file || seen.has(label)) return "";
    seen.add(label);
    number++;
    const text = caption.replace(/[[\]()]/g, " ").replace(/\s+/g, " ").trim();
    return `![รูปที่ ${number}${text ? ` — ${text}` : ""}](IMG:${file})`;
  });
}

/**
 * The LINE menu makes one button per "SOP-FO-01 · name" heading, so these must
 * be uniform. Gemini writes the separator differently from page to page and
 * keeps the form's "Position:" label.
 */
export function tidyCodeHeadings(markdown: string): string {
  return markdown.replace(
    /^(#{2,3})\s+((?:SOP|IT)-[A-Z]{2,4}-\d{2}[A-Z]?)\s*[·:—-]?\s*(?:Position\s*:|ตำแหน่ง\s*:)?\s*(.+)$/gm,
    (_, hashes: string, code: string, name: string) => `${hashes} ${code} · ${name.trim()}`
  );
}

/** Gemini sometimes wraps the whole answer in a code fence despite being told not to. */
export function stripFence(markdown: string): string {
  return markdown.replace(/^\s*```(?:markdown|md)?\s*\n/i, "").replace(/\n```\s*$/, "").trim();
}
