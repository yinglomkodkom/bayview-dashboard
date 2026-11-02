/** Deterministic id from the filename so re-uploading the same file replaces its old chunks. */
export function fileIdFromName(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return `sop-${hash.toString(16)}`;
}

/** SOP figures live in the public sop-images bucket as <fileId>_fig01.png. */
export const SOP_IMAGES_BUCKET = "sop-images";

export function figurePrefix(fileId: string): string {
  return `${fileId}_fig`;
}
