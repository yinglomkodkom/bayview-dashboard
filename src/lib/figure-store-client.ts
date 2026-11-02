// Runs in the browser: stores a picture taken from an uploaded file, whichever
// kind of file it came from, as <fileId>_figNN so it belongs to that file.
import { figurePrefix } from "@/lib/sop-file-id";

const MAX_STORED_BYTES = 1024 * 1024; // LINE's limit for a preview image

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("แปลงรูปไม่สำเร็จ"))), type, quality);
  });
}

/** A number in reading order; JPEG only when the PNG would be over the limit. */
export async function figureName(fileId: string, number: number, canvas: HTMLCanvasElement): Promise<string> {
  const png = (await toBlob(canvas, "image/png")).size <= MAX_STORED_BYTES;
  return `${figurePrefix(fileId)}${String(number).padStart(2, "0")}.${png ? "png" : "jpg"}`;
}

async function figureFile(name: string, canvas: HTMLCanvasElement): Promise<Blob> {
  if (name.endsWith(".png")) return toBlob(canvas, "image/png");
  for (const quality of [0.85, 0.7, 0.5]) {
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob.size <= MAX_STORED_BYTES) return blob;
  }
  throw new Error("รูปในไฟล์ใหญ่เกิน 1 MB");
}

export async function storeFigure(name: string, canvas: HTMLCanvasElement): Promise<void> {
  const form = new FormData();
  form.append("name", name);
  form.append("image", await figureFile(name, canvas), name);
  const res = await fetch("/api/documents/figure", { method: "POST", body: form });
  const data = await res.json().catch(() => null);
  if (!data?.success) throw new Error(data?.error || `เก็บรูปไม่สำเร็จ (HTTP ${res.status})`);
}
