import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMfa } from "@/lib/require-mfa";
import type { AdminProfile } from "@/lib/admin-reply";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SOP_STORAGE_BUCKET,
  chunkText,
  detectFileType,
  embedTexts,
  extractText,
  fileIdFromName,
  sopStoragePath,
} from "@/lib/documents";
import { parseSopGroup } from "@/lib/sop-groups";
import { figureRefs, figuresOfDocument, removeFigures } from "@/lib/sop-figures";

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
const INSERT_BATCH_SIZE = 50; // each row carries a 3072-number embedding

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("email, emp_id, name, name_th, position, department")
      .eq("user_id", user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const mfaBlocked = await requireMfa(supabase);
    if (mfaBlocked) return mfaBlocked;

    // Shown in the SOP list as who brought the file in.
    const uploader = adminUser as AdminProfile;
    const uploadedBy = uploader.name_th?.trim() || uploader.name?.trim() || uploader.email;

    const formData = await request.formData();
    const file = formData.get("file");

    // Every file must say whose it is and who may read it; match_documents
    // enforces the access when the bot searches.
    const choice = parseSopGroup({
      groupType: formData.get("group_type"),
      group: formData.get("group"),
      access: formData.get("access"),
    });
    if (!choice.ok) {
      return NextResponse.json({ success: false, error: choice.error }, { status: 400 });
    }
    const { groupType, group, access } = choice;

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "ไม่พบไฟล์ที่อัปโหลด" }, { status: 400 });
    }

    const fileType = detectFileType(file.name, file.type);
    if (!fileType) {
      return NextResponse.json(
        { success: false, error: "รองรับเฉพาะไฟล์ PDF, DOCX, TXT หรือ MD เท่านั้น" },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ success: false, error: "ไฟล์นี้ว่างเปล่า" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 25 MB)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // PDF and Word arrive already converted by the browser (pdf-read-client.ts,
    // docx-read-client.ts), which also stores their pictures. A PDF's text layer
    // alone loses Thai vowels and headings; both would lose where pictures go.
    const converted = formData.get("converted_text");
    const text =
      fileType !== "text" && typeof converted === "string" && converted.trim()
        ? converted
        : await extractText(buffer, fileType);
    const figureNames: string[] = JSON.parse(String(formData.get("figures") || "[]"));

    if (!text.trim()) {
      return NextResponse.json(
        { success: false, error: "ไม่พบข้อความในไฟล์นี้ (อาจเป็นไฟล์สแกน/รูปภาพล้วน)" },
        { status: 400 }
      );
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return NextResponse.json({ success: false, error: "แยกเนื้อหาไฟล์ไม่สำเร็จ" }, { status: 400 });
    }

    const fileId = fileIdFromName(file.name);
    const admin = createAdminClient();

    // Before touching the old copy: if Gemini fails, the current file stays.
    const embeddings = await embedTexts(chunks);

    const previousFigures = await figuresOfDocument(admin, fileId);

    // Replace: remove any previously-ingested chunks for this same filename.
    const { error: deleteError } = await admin
      .from("documents1")
      .delete()
      .eq("metadata->>file_id", fileId);
    if (deleteError) throw deleteError;

    // Store the original file so admins can open/preview it later without
    // re-downloading — upsert so re-uploading the same filename replaces it.
    const storagePath = sopStoragePath(fileId, file.name);
    const { error: storageError } = await admin.storage
      .from(SOP_STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type || undefined, upsert: true });
    if (storageError) throw storageError;

    const { data: signedUrlData } = await admin.storage
      .from(SOP_STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    const now = new Date().toISOString();
    try {
      const rows = chunks.map((content, i) => ({
        title: file.name,
        content,
        embedding: embeddings[i],
        metadata: { file_id: fileId, title: file.name, chunk_index: i },
        uploaded_by: uploadedBy,
        uploaded_by_user_id: user.id,
        sop_group: group,
        sop_group_type: groupType,
        sop_access: access,
        created_at: now,
        updated_at: now,
      }));
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const { error: insertError } = await admin
          .from("documents1")
          .insert(rows.slice(i, i + INSERT_BATCH_SIZE));
        if (insertError) throw insertError;
      }
    } catch (error) {
      // Don't leave a half-ingested doc behind (some chunks searchable, rest
      // missing) — clean up whatever this attempt already wrote and let the
      // user retry from a clean slate.
      await admin.from("documents1").delete().eq("metadata->>file_id", fileId);
      await admin.storage.from(SOP_STORAGE_BUCKET).remove([storagePath]);
      throw error;
    }

    // Pictures from an older version of this file that the new one no longer uses.
    await removeFigures(admin, fileId, previousFigures, [...figureNames, ...figureRefs([text])]);

    const dept = adminUser.department ? ` (แผนก: ${adminUser.department})` : "";
    const figureNote = figureNames.length ? ` รูป ${figureNames.length} รูป` : "";
    const checkNote = String(formData.get("convert_note") || "");
    const { logAdminActivity } = await import("@/lib/admin-audit");
    await logAdminActivity({
      action_type: "upload_sop",
      target: file.name,
      details: `อัปโหลดเอกสาร SOP จำนวน ${chunks.length} ส่วน${figureNote}${dept} ขนาด ${(file.size / 1024).toFixed(1)} KB${checkNote}`,
      status: "success",
      email: adminUser.email,
      admin_name: uploadedBy,
      user_id: user.id,
    });

    return NextResponse.json({
      success: true,
      file_id: fileId,
      title: file.name,
      chunk_count: chunks.length,
      figure_count: figureNames.length,
      uploaded_by: uploadedBy,
      sop_group: group,
      sop_group_type: groupType,
      sop_access: access,
      view_url: signedUrlData?.signedUrl ?? null,
    });
  } catch (error) {
    console.error("Upload document API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
