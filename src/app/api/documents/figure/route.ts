import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMfa } from "@/lib/require-mfa";
import { createAdminClient } from "@/lib/supabase/admin";
import { SOP_IMAGES_BUCKET } from "@/lib/sop-file-id";

// LINE refuses a preview image over 1 MB, and the bot uses one URL for both.
const MAX_FIGURE_BYTES = 1024 * 1024;
const FIGURE_NAME = /^sop-[0-9a-f]+_fig\d{2,3}\.(png|jpg)$/;

/** Stores one picture from a PDF, one request each so no upload meets the body limit. */
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
    const name = String(form.get("name") || "");
    const image = form.get("image");
    if (!FIGURE_NAME.test(name) || !(image instanceof File)) {
      return NextResponse.json({ success: false, error: "ข้อมูลรูปไม่ถูกต้อง" }, { status: 400 });
    }
    if (image.size > MAX_FIGURE_BYTES) {
      return NextResponse.json({ success: false, error: "รูปมีขนาดเกิน 1 MB" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage
      .from(SOP_IMAGES_BUCKET)
      .upload(name, Buffer.from(await image.arrayBuffer()), {
        contentType: name.endsWith(".png") ? "image/png" : "image/jpeg",
        upsert: true,
      });
    if (error) throw error;

    return NextResponse.json({ success: true, name });
  } catch (error) {
    console.error("Upload figure API error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
