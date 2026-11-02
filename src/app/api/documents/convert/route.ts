import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMfa } from "@/lib/require-mfa";
import { convertPdfPages } from "@/lib/pdf-gemini";

export const maxDuration = 120;

/**
 * One batch of PDF pages to Markdown. The browser calls this once per batch, so
 * a long manual is many short requests rather than one that hits the time limit.
 */
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
      .select("email")
      .eq("user_id", user.id)
      .single();
    if (!adminUser) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const mfaBlocked = await requireMfa(supabase);
    if (mfaBlocked) return mfaBlocked;

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "ไม่พบไฟล์ PDF" }, { status: 400 });
    }

    const fromPage = Number(form.get("from_page"));
    const toPage = Number(form.get("to_page"));
    const totalPages = Number(form.get("total_pages"));
    if (!fromPage || !toPage || !totalPages) {
      return NextResponse.json({ success: false, error: "ระบุหน้าไม่ครบ" }, { status: 400 });
    }

    const figures: { label: string; mimeType: string; data: Buffer }[] = [];
    for (const [key, value] of form.entries()) {
      if (!key.startsWith("fig:") || !(value instanceof File)) continue;
      figures.push({
        label: key.slice(4),
        mimeType: value.type || "image/jpeg",
        data: Buffer.from(await value.arrayBuffer()),
      });
    }

    const markdown = await convertPdfPages({
      pdf: Buffer.from(await file.arrayBuffer()),
      fromPage,
      toPage,
      totalPages,
      links: JSON.parse(String(form.get("links") || "[]")),
      missingLines: JSON.parse(String(form.get("missing_lines") || "[]")),
      figures,
    });

    return NextResponse.json({ success: true, markdown });
  } catch (error) {
    console.error("Convert PDF API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
