// Which pictures in sop-images belong to which SOP file. A picture belongs to a
// file by its <fileId>_fig name or by an IMG: reference in the file's text, which
// is how the older manuals, with names like IT-NET-02_fig01_..., point to theirs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SOP_IMAGES_BUCKET, figurePrefix } from "@/lib/sop-file-id";

const PAGE_SIZE = 1000;

/** Picture names written in a file's text. */
export function figureRefs(texts: string[]): string[] {
  return [...new Set(texts.flatMap((t) => [...t.matchAll(/IMG:([^\s)\]|]+)/g)].map((m) => m[1])))];
}

/** Picture names the chunks of one file point to. */
export async function figuresOfDocument(admin: SupabaseClient, fileId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("documents1")
    .select("content")
    .eq("metadata->>file_id", fileId)
    .like("content", "%IMG:%")
    .limit(PAGE_SIZE);
  if (error) throw error;
  return figureRefs((data || []).map((row) => row.content as string));
}

// Paged: stopping early here would delete a picture another file still shows.
async function figuresOfOtherDocuments(admin: SupabaseClient, fileId: string): Promise<Set<string>> {
  const contents: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from("documents1")
      .select("content")
      .neq("metadata->>file_id", fileId)
      .like("content", "%IMG:%")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    contents.push(...(data || []).map((row) => row.content as string));
    if ((data || []).length < PAGE_SIZE) break;
  }
  return new Set(figureRefs(contents));
}

/**
 * Removes this file's pictures except those in `keep`. A picture another file
 * also points to stays. Returns how many went.
 */
export async function removeFigures(
  admin: SupabaseClient,
  fileId: string,
  referenced: string[],
  keep: string[] = []
): Promise<number> {
  const prefix = figurePrefix(fileId);
  const { data: stored, error } = await admin.storage
    .from(SOP_IMAGES_BUCKET)
    .list("", { search: prefix, limit: PAGE_SIZE });
  if (error) throw error;

  const named = (stored || []).map((o) => o.name).filter((name) => name.startsWith(prefix));
  const candidates = [...new Set([...named, ...referenced])].filter((name) => !keep.includes(name));
  if (candidates.length === 0) return 0;

  const inUse = await figuresOfOtherDocuments(admin, fileId);
  const unused = candidates.filter((name) => !inUse.has(name));
  if (unused.length === 0) return 0;

  const { data: removed, error: removeError } = await admin.storage.from(SOP_IMAGES_BUCKET).remove(unused);
  if (removeError) throw removeError;
  return (removed || []).length;
}
