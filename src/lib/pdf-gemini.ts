// Asks Gemini to copy PDF pages into Markdown. Used by /api/documents/convert.

const PDF_MODEL = "gemini-3.8-flash";

export interface ConvertRequest {
  pdf: Buffer;
  fromPage: number;
  toPage: number;
  totalPages: number;
  /** Clickable links in these pages; the only addresses the model may use. */
  links: string[];
  /** Previews of the pictures on these pages. */
  figures: { label: string; mimeType: string; data: Buffer }[];
  /** Text a first attempt lost, so the retry can put it back. */
  missingLines?: string[];
}

export function buildConvertPrompt(req: ConvertRequest): string {
  const first = req.fromPage === 1;
  return [
    `แปลงหน้า ${req.fromPage} ถึง ${req.toPage} จากทั้งหมด ${req.totalPages} หน้าของ PDF ที่แนบเป็น Markdown ภาษาเดิม เพื่อใช้ในระบบค้นคู่มือ แปลงเฉพาะหน้าเหล่านี้เท่านั้น`,
    "",
    "กฎสำคัญที่สุด: คัดลอกข้อความทุกบรรทัดตามต้นฉบับ ห้ามสรุป ห้ามตัดทอน ห้ามแปล ห้ามแต่งเติม ห้ามเรียบเรียงใหม่ แก้ได้เฉพาะตัวอักษรที่ PDF ทำเพี้ยนให้ตรงกับที่เห็นในหน้าเอกสาร",
    "- รักษาคำสั่ง ค่า IP ตัวเลข และชื่อเฉพาะตามต้นฉบับทุกตัวอักษร ใส่คำสั่งใน code block",
    "- ตารางใช้ตาราง Markdown",
    "- ไม่เอาหัวกระดาษ ท้ายกระดาษ หรือเลขหน้าที่ซ้ำทุกหน้า",
    "- ข้อความที่อยู่ในรูปไม่ต้องพิมพ์ซ้ำ",
    "",
    "หัวข้อ",
    first
      ? "- ชื่อเรื่องของเอกสารใช้ # ครั้งเดียว"
      : "- หน้าเหล่านี้เป็นส่วนกลางของเอกสาร ห้ามใช้ # และห้ามเขียนชื่อเรื่องของเอกสารซ้ำ",
    "- หัวข้อหลักใช้ ## หัวข้อย่อยใช้ ### คงข้อความหัวข้อตามต้นฉบับ รวมถึงรหัสเอกสาร เช่น SOP-FO-01",
    "- หัวเรื่องที่มีรหัสเอกสาร ให้รวมรหัสกับชื่อไว้ในบรรทัดหัวข้อเดียวกัน แม้ต้นฉบับแยกบรรทัดหรืออยู่ในตาราง เช่น ## SOP-FO-01 · Front Office Manager (FOM) / ผู้จัดการแผนกส่วนหน้า",
    "- เนื้อหาที่ต่อมาจากหน้าก่อนไม่ต้องตั้งหัวข้อใหม่",
    "",
    "ลิงก์",
    req.links.length
      ? `- ใช้ได้เฉพาะลิงก์ที่เห็นในเอกสารหรือในรายการนี้: ${req.links.join(" ")}`
      : "- ใช้ได้เฉพาะลิงก์ที่เห็นเป็นตัวอักษรในเอกสาร",
    "- ข้อความที่เป็นลิงก์แต่ไม่รู้ที่อยู่ ให้เขียนเป็นข้อความธรรมดา ห้ามเดาที่อยู่ลิงก์",
    "",
    "รูป",
    req.figures.length
      ? [
          "หลังข้อความนี้มีรูปที่ดึงจากหน้าเหล่านี้ แต่ละรูปมีป้ายชื่อ เช่น FIG:p3_2 ดูว่าแต่ละรูปอยู่ตรงไหนในหน้าเอกสาร แล้วใส่บรรทัดนี้ตรงตำแหน่งนั้นพอดี ตามลำดับที่รูปปรากฏ",
          "![คำบรรยายรูปสั้นๆ ภาษาเดียวกับเอกสาร บอกว่ารูปแสดงอะไร](FIG:p3_2)",
          "- ใช้ทุกรูปที่เป็นเนื้อหา แต่ละรูปครั้งเดียว ข้ามเฉพาะโลโก้ ของตกแต่ง หรือรูปว่างที่ไม่มีเนื้อหา",
          "- ห้ามใช้ป้ายชื่อที่ไม่มีในรายการ",
        ].join("\n")
      : "หน้าเหล่านี้ไม่มีรูปที่ต้องใส่ ห้ามเขียนรูปในผลลัพธ์",
    ...(req.missingLines?.length
      ? [
          "",
          "รอบก่อนข้อความเหล่านี้ตกหล่น ต้องมีครบในรอบนี้ ตรงตำแหน่งเดิมในเอกสาร (ตัวอักษรในรายการอาจเพี้ยน ให้ยึดตามที่เห็นในหน้าเอกสาร):",
          ...req.missingLines.slice(0, 60).map((line) => `- ${line}`),
        ]
      : []),
    "",
    "ตอบเป็น Markdown ล้วน ไม่ต้องครอบด้วย code fence",
  ].join("\n");
}

const MAX_ATTEMPTS = 3;

export async function convertPdfPages(req: ConvertRequest): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not configured");

  const parts: unknown[] = [
    { inlineData: { mimeType: "application/pdf", data: req.pdf.toString("base64") } },
    { text: buildConvertPrompt(req) },
  ];
  for (const figure of req.figures) {
    parts.push({ text: `FIG:${figure.label}` });
    parts.push({ inlineData: { mimeType: figure.mimeType, data: figure.data.toString("base64") } });
  }

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${PDF_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0, maxOutputTokens: 65536 },
        }),
      }
    );

    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_ATTEMPTS) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini PDF request failed (${res.status}): ${body.slice(0, 300)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      continue;
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text: string = (candidate?.content?.parts || [])
      .map((part: { text?: string }) => part.text || "")
      .join("");
    // A cut-off answer would silently lose the end of these pages.
    if (candidate?.finishReason !== "STOP" || !text.trim()) {
      throw new Error(`Gemini stopped early (${candidate?.finishReason || "no answer"})`);
    }
    return text;
  }
}
