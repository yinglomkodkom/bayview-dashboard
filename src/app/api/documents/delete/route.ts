import { figuresOfDocument, removeFigures } from "@/lib/sop-figures";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMfa } from "@/lib/require-mfa";
import { createAdminClient } from "@/lib/supabase/admin";
import { SOP_STORAGE_BUCKET } from "@/lib/documents";

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
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!adminUser) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const mfaBlocked = await requireMfa(supabase);
    if (mfaBlocked) return mfaBlocked;

    const body = await request.json();
    const { file_id: fileId } = body;

    if (!fileId || typeof fileId !== "string") {
      return NextResponse.json({ success: false, error: "file_id is required" }, { status: 400 });
    }

    const { data: adminProfile } = await supabase
      .from("admin_users")
      .select("email, name, name_th, department")
      .eq("user_id", user.id)
      .maybeSingle();

    const admin = createAdminClient();

    // Query doc title before deletion for audit logging
    const { data: docInfo } = await admin
      .from("documents1")
      .select("title")
      .eq("metadata->>file_id", fileId)
      .limit(1)
      .maybeSingle();

    const docTitle = docInfo?.title || fileId;

    // Read before the rows go: their text is what says which pictures are this file's.
    const referencedFigures = await figuresOfDocument(admin, fileId);

    const { error } = await admin.from("documents1").delete().eq("metadata->>file_id", fileId);
    if (error) throw error;

    // Best-effort: also remove the stored original file (folder named after
    // file_id). Older rows ingested via the n8n Google Drive flow never had
    // one, so a missing object here is expected and not an error.
    const { data: objects } = await admin.storage.from(SOP_STORAGE_BUCKET).list(fileId);
    if (objects && objects.length > 0) {
      await admin.storage
        .from(SOP_STORAGE_BUCKET)
        .remove(objects.map((o) => `${fileId}/${o.name}`));
    }

    const removedFigures = await removeFigures(admin, fileId, referencedFigures);

    const { logAdminActivity } = await import("@/lib/admin-audit");
    await logAdminActivity({
      action_type: "delete_sop",
      target: docTitle,
      details: `ลบเอกสาร SOP ออกจากระบบและ Storage พร้อมรูป ${removedFigures} รูป (รหัส: ${fileId})`,
      status: "success",
      email: adminProfile?.email || user.email,
      admin_name: adminProfile?.name_th || adminProfile?.name || user.email,
      user_id: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete document API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
