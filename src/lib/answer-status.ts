// Decides whether a bot answer means "the SOP has nothing on this", the same
// way the n8n "Build LINE Messages" node (Main.sop-gaps.json) does when it
// writes chat_logs.status, and supabase-sop-gaps.sql does for old rows. Keep
// the three in sync.
//
// Rows logged by the older workflow were filed by a check that missed most of
// these answers and stored them as success, so the logs table re-checks every
// success row with this instead of trusting the stored status alone.

const OUTSIDE_SOP = /นอกเหนือขอบเขต SOP/;
const NO_DATA =
  /(ไม่มีข้อมูล|ไม่มีระบุ|ไม่ได้ระบุ|ไม่มีการระบุ|ยังไม่มีการกำหนด|ไม่ได้กำหนด|ไม่พบข้อมูล|ไม่มีการกำหนด)/;
// A bare "ไม่มี" is not enough on its own — "ไม่มีค่าใช้จ่าย" is an answer. It
// counts only together with a department referral, which the prompt gives
// only when the bot cannot answer.
const DENIES = /(ยังไม่มี|ไม่มี|ไม่พบ)/;
const REFERS = /(ติดต่อ(ที่)?แผนก|สอบถาม(ได้)?(ที่|กับ|ผ่าน)แผนก)/;

// The line "Build LINE Messages" adds under an answer reused from an admin
// (admin_answers). An admin's "ไม่มีครับ" is an answer, not a gap in the SOP.
const FROM_ADMIN_ANSWER = /มาจากที่แอดมินเคยตอบคำถามคล้ายกัน|an earlier admin answer to a similar question/;

export function soundsNotFound(answer: string | null | undefined): boolean {
  const text = (answer || "").trim();
  // Answered from general practice: the user got an answer, so not Not Found.
  if (!text || OUTSIDE_SOP.test(text) || FROM_ADMIN_ANSWER.test(text)) return false;
  if (NO_DATA.test(text.slice(0, 150))) return true;
  return DENIES.test(text.slice(0, 90)) && REFERS.test(text);
}

/** A success row whose answer is really "not in the SOP" is shown as not_found. */
export function correctStatus<T extends { status: string; ai_response: string | null }>(log: T): T {
  return log.status === "success" && soundsNotFound(log.ai_response)
    ? ({ ...log, status: "not_found" } as T)
    : log;
}
