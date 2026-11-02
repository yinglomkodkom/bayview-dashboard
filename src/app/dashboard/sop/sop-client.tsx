"use client";

import { useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UploadCloud, FileText, Trash2, Loader2, AlertTriangle, X, FolderOpen, Pencil, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_TOPIC_LENGTH,
  SOP_DEPARTMENTS,
  type SopAccess,
  type SopDocumentSummary,
} from "@/lib/sop-groups";
import { FOCUS_RING, onActivateKey } from "@/lib/keyboard";
import { convertDocx } from "@/lib/docx-read-client";
import { convertPdf } from "@/lib/pdf-read-client";

interface SopClientProps {
  initialDocuments: SopDocumentSummary[];
  configError: string | null;
}

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

// Sentinel for the "อื่นๆ" choice: files every employee may read, filed under a typed topic.
const OTHER = "__other__";

const selectClass =
  "w-full h-9 rounded-md border border-zinc-300 dark:border-zinc-700/50 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-800 dark:text-zinc-200";

const ACCESS_LABEL: Record<SopAccess, string> = {
  department: "เฉพาะแผนก",
  all: "พนักงานทุกคน",
};

/** Department groups first (A-Z), then the "อื่นๆ" topics (A-Z), then anything unfiled. */
function groupDocuments(docs: SopDocumentSummary[]) {
  const groups = new Map<string, { name: string; type: SopDocumentSummary["sop_group_type"]; docs: SopDocumentSummary[] }>();
  for (const doc of docs) {
    const name = doc.sop_group || "ยังไม่ระบุแผนก";
    const key = `${doc.sop_group_type || "none"}:${name}`;
    const g = groups.get(key) || { name, type: doc.sop_group_type, docs: [] };
    g.docs.push(doc);
    groups.set(key, g);
  }
  const rank = (t: SopDocumentSummary["sop_group_type"]) => (t === "department" ? 0 : t === "other" ? 1 : 2);
  return Array.from(groups.values()).sort((a, b) => rank(a.type) - rank(b.type) || a.name.localeCompare(b.name));
}

function fileExtension(fileName: string): string {
  return fileName.toLowerCase().split(".").pop() || "";
}

/** True once the choice is complete: a department plus access, or "อื่นๆ" plus a topic. */
function isGroupReady(groupChoice: string, topic: string, access: SopAccess | "") {
  return groupChoice === OTHER ? topic.trim().length > 0 : SOP_DEPARTMENTS.includes(groupChoice) && access !== "";
}

/** Department / topic / access picker, shared by the upload form and the edit dialog. */
function SopGroupFields({
  groupChoice,
  onGroupChoice,
  topic,
  onTopic,
  access,
  onAccess,
  existingTopics,
  disabled,
  idPrefix,
}: {
  groupChoice: string;
  onGroupChoice: (v: string) => void;
  topic: string;
  onTopic: (v: string) => void;
  access: SopAccess | "";
  onAccess: (v: SopAccess | "") => void;
  existingTopics: string[];
  disabled?: boolean;
  idPrefix: string;
}) {
  const isOther = groupChoice === OTHER;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-zinc-700 dark:text-zinc-300">
          แผนกเจ้าของไฟล์ <span className="text-rose-500">*</span>
        </Label>
        <select
          value={groupChoice}
          onChange={(e) => {
            onGroupChoice(e.target.value);
            onAccess("");
          }}
          disabled={disabled}
          className={selectClass}
        >
          <option value="">— เลือกแผนก —</option>
          {SOP_DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
          <option value={OTHER}>อื่นๆ (พนักงานทุกคนเข้าถึงได้)</option>
        </select>
      </div>

      {isOther ? (
        <div className="space-y-1.5">
          <Label className="text-zinc-700 dark:text-zinc-300">
            ชื่อหัวข้อ <span className="text-rose-500">*</span>
          </Label>
          <Input
            value={topic}
            onChange={(e) => onTopic(e.target.value)}
            maxLength={MAX_TOPIC_LENGTH}
            list={`${idPrefix}-topics`}
            placeholder="เช่น Baan Sukee"
            disabled={disabled}
          />
          <datalist id={`${idPrefix}-topics`}>
            {existingTopics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      ) : groupChoice ? (
        <div className="space-y-1.5">
          <Label className="text-zinc-700 dark:text-zinc-300">
            สิทธิ์การเข้าถึง <span className="text-rose-500">*</span>
          </Label>
          <select
            value={access}
            onChange={(e) => onAccess(e.target.value as SopAccess | "")}
            disabled={disabled}
            className={selectClass}
          >
            <option value="">— เลือกสิทธิ์ —</option>
            <option value="department">เฉพาะพนักงานแผนก {groupChoice}</option>
            <option value="all">พนักงานทุกคน</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}

export function SopClient({ initialDocuments, configError }: SopClientProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [uploadStep, setUploadStep] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Required before upload: whose file it is, and who may read it.
  const [groupChoice, setGroupChoice] = useState("");
  const [topic, setTopic] = useState("");
  const [access, setAccess] = useState<SopAccess | "">("");
  const isOther = groupChoice === OTHER;
  const groupReady = isGroupReady(groupChoice, topic, access);
  // Edit an uploaded file's department / access without re-uploading it.
  const [editingDoc, setEditingDoc] = useState<SopDocumentSummary | null>(null);
  const [editGroupChoice, setEditGroupChoice] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editAccess, setEditAccess] = useState<SopAccess | "">("");
  const [savingEdit, setSavingEdit] = useState(false);

  const existingTopics = Array.from(
    new Set(documents.filter((d) => d.sop_group_type === "other" && d.sop_group).map((d) => d.sop_group as string))
  );

  const [previewDoc, setPreviewDoc] = useState<SopDocumentSummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  async function openPreview(doc: SopDocumentSummary) {
    if (!doc.view_url) return;
    setPreviewDoc(doc);
    setPreviewHtml(null);
    setPreviewText(null);
    setPreviewError(null);

    const ext = fileExtension(doc.title);
    if (ext === "pdf") return; // rendered directly via <iframe>, nothing to fetch

    setPreviewLoading(true);
    try {
      if (ext === "docx") {
        const [mammoth, res] = await Promise.all([import("mammoth"), fetch(doc.view_url)]);
        if (!res.ok) throw new Error();
        const arrayBuffer = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setPreviewHtml(result.value);
      } else {
        const res = await fetch(doc.view_url);
        if (!res.ok) throw new Error();
        setPreviewText(await res.text());
      }
    } catch {
      setPreviewError("โหลดไฟล์เพื่อแสดงตัวอย่างไม่สำเร็จ");
    } finally {
      setPreviewLoading(false);
    }
  }

  function isAcceptedFile(file: File) {
    const name = file.name.toLowerCase();
    return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  }

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    const rejected = incoming.filter((f) => !isAcceptedFile(f));
    if (rejected.length > 0) {
      toast.error(`รองรับเฉพาะไฟล์ PDF, DOCX, TXT หรือ MD เท่านั้น (ข้าม ${rejected.length} ไฟล์ที่ไม่รองรับ)`);
    }
    const accepted = incoming.filter(isAcceptedFile);
    if (accepted.length === 0) return;

    setPendingFiles((prev) => {
      // Skip files already queued (same name + size) so re-dropping the same
      // selection doesn't duplicate entries in the list.
      const existingKeys = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const deduped = accepted.filter((f) => !existingKeys.has(`${f.name}:${f.size}`));
      return [...prev, ...deduped];
    });
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) addFiles(e.target.files);
    e.target.value = "";
  }

  function removePendingFile(e: React.MouseEvent, index: number) {
    e.stopPropagation();
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }

  async function handleUpload() {
    if (pendingFiles.length === 0) return;
    if (!groupReady) {
      toast.error(isOther ? "กรุณาพิมพ์ชื่อหัวข้อของไฟล์" : "กรุณาเลือกแผนกและสิทธิ์การเข้าถึงก่อนอัปโหลด");
      return;
    }
    setUploading(true);
    const total = pendingFiles.length;
    let successCount = 0;
    const failed: string[] = [];
    const notes: string[] = [];

    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      setUploadProgress({ current: i + 1, total });
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("group_type", isOther ? "other" : "department");
        formData.append("group", isOther ? topic.trim() : groupChoice);
        formData.append("access", isOther ? "all" : access);

        if (fileExtension(file.name) === "pdf") {
          const pdf = await convertPdf(file, setUploadStep);
          formData.append("converted_text", pdf.markdown);
          formData.append("figures", JSON.stringify(pdf.figureNames));
          formData.append(
            "convert_note",
            ` · ${pdf.pageCount} หน้า · ข้อความครบ ${pdf.coveragePercent}%` +
              (pdf.restoredLines ? ` · เติมกลับ ${pdf.restoredLines} บรรทัด` : "") +
              (pdf.removedUrls.length ? ` · ตัดลิงก์ที่ไม่มีใน PDF ${pdf.removedUrls.length}` : "")
          );
          if (pdf.restoredLines) {
            toast.warning(`${file.name}: AI อ่านตกหล่น ${pdf.restoredLines} บรรทัด ระบบเติมกลับจาก PDF ให้แล้ว`);
          }
          notes.push(`${file.name}: รูป ${pdf.figureNames.length} รูป ข้อความครบ ${pdf.coveragePercent}%`);
          setUploadStep("กำลังบันทึกลงระบบ");
        } else if (fileExtension(file.name) === "docx") {
          const docx = await convertDocx(file, setUploadStep);
          formData.append("converted_text", docx.markdown);
          formData.append("figures", JSON.stringify(docx.figureNames));
          if (docx.restoredLines) {
            formData.append("convert_note", ` · เติมกลับ ${docx.restoredLines} บรรทัด`);
          }
          if (docx.skippedFigures) {
            toast.warning(`${file.name}: เก็บรูปไม่ได้ ${docx.skippedFigures} รูป เพราะเป็นรูปแบบที่เว็บเปิดไม่ได้ (เช่น EMF)`);
          }
          notes.push(`${file.name}: รูป ${docx.figureNames.length} รูป`);
          setUploadStep("กำลังบันทึกลงระบบ");
        }

        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.success) {
          successCount++;
          setDocuments((prev) => {
            const withoutOld = prev.filter((d) => d.file_id !== data.file_id);
            return [
              {
                file_id: data.file_id,
                title: data.title,
                chunk_count: data.chunk_count,
                updated_at: new Date().toISOString(),
                uploaded_by: data.uploaded_by ?? null,
                sop_group: data.sop_group ?? null,
                sop_group_type: data.sop_group_type ?? null,
                sop_access: data.sop_access ?? null,
                view_url: data.view_url ?? null,
              },
              ...withoutOld,
            ];
          });
        } else {
          failed.push(`${file.name}: ${data.error || "อัปโหลดไม่สำเร็จ"}`);
        }
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "เชื่อมต่อไม่สำเร็จ"}`);
      }
    }

    if (successCount > 0) {
      toast.success(`อัปโหลดสำเร็จ ${successCount} จาก ${total} ไฟล์`);
    }
    notes.forEach((msg) => toast.info(msg));
    failed.forEach((msg) => toast.error(msg));

    setPendingFiles([]);
    setUploadProgress(null);
    setUploadStep("");
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openEdit(doc: SopDocumentSummary) {
    const other = doc.sop_group_type === "other";
    setEditGroupChoice(other ? OTHER : doc.sop_group && SOP_DEPARTMENTS.includes(doc.sop_group) ? doc.sop_group : "");
    setEditTopic(other ? doc.sop_group || "" : "");
    setEditAccess(other ? "" : doc.sop_access || "");
    setEditingDoc(doc);
  }

  async function saveEdit() {
    if (!editingDoc || !isGroupReady(editGroupChoice, editTopic, editAccess)) return;
    const other = editGroupChoice === OTHER;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/documents/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: editingDoc.file_id,
          group_type: other ? "other" : "department",
          group: other ? editTopic.trim() : editGroupChoice,
          access: other ? "all" : editAccess,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "บันทึกไม่สำเร็จ");
      setDocuments((prev) =>
        prev.map((d) =>
          d.file_id === editingDoc.file_id
            ? { ...d, sop_group: data.sop_group, sop_group_type: data.sop_group_type, sop_access: data.sop_access }
            : d
        )
      );
      toast.success(`บันทึกแผนกและสิทธิ์ของ "${editingDoc.title}" แล้ว`);
      setEditingDoc(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(doc: SopDocumentSummary) {
    if (!confirm(`ลบเอกสาร "${doc.title}" ออกจากฐานความรู้ของ AI ใช่หรือไม่?`)) return;
    setDeletingId(doc.file_id);
    try {
      const res = await fetch("/api/documents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: doc.file_id }),
      });
      const data = await res.json();
      if (data.success) {
        setDocuments((prev) => prev.filter((d) => d.file_id !== doc.file_id));
        toast.success(`ลบ "${doc.title}" แล้ว`);
      } else {
        toast.error(data.error || "ลบไม่สำเร็จ");
      }
    } catch {
      toast.error("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {configError && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            โหลดรายการเอกสารไม่สำเร็จ รายการด้านล่างจึงอาจว่างเปล่า ไม่ได้แปลว่าไม่มีเอกสาร
            กรุณารีเฟรชหน้านี้ ถ้ายังไม่ได้ ให้แจ้งผู้ดูแลระบบ
          </span>
        </div>
      )}

      {/* Upload Card */}
      <Card className="border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-400" />
            อัปโหลดไฟล์ SOP
          </CardTitle>
          <CardDescription className="text-zinc-600 dark:text-zinc-400">
            รองรับไฟล์ PDF, DOCX, TXT, MD — ถ้าอัปโหลดไฟล์ชื่อเดิมซ้ำ ระบบจะแทนที่เนื้อหาเก่าให้อัตโนมัติ
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
              e.preventDefault();
              fileInputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="เลือกไฟล์ SOP ที่จะอัปโหลด"
            className={`rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${FOCUS_RING} ${
              isDragging
                ? "border-blue-500 bg-blue-500/5"
                : "border-zinc-300 dark:border-zinc-700/50 hover:border-zinc-400 dark:hover:border-zinc-600"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              onChange={handlePickFile}
              onClick={(e) => e.stopPropagation()}
              className="hidden"
            />

            {pendingFiles.length > 0 ? (
              <div className="space-y-2">
                {pendingFiles.map((file, i) => (
                  <div
                    key={`${file.name}-${file.size}-${i}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-zinc-300 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/50 p-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {(file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => removePendingFile(e, i)}
                      className="shrink-0 p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-200"
                      aria-label="เอาไฟล์ออก"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center pt-1">
                  คลิกเพื่อเพิ่มไฟล์อื่นอีก
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
                <UploadCloud className="w-8 h-8 text-zinc-500 dark:text-zinc-400" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  ลากไฟล์มาวางตรงนี้ (เลือกได้หลายไฟล์) หรือคลิกเพื่อเลือกไฟล์
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">รองรับ PDF, DOCX, TXT, MD</p>
              </div>
            )}
          </div>

          <SopGroupFields
            groupChoice={groupChoice}
            onGroupChoice={setGroupChoice}
            topic={topic}
            onTopic={setTopic}
            access={access}
            onAccess={setAccess}
            existingTopics={existingTopics}
            disabled={uploading}
            idPrefix="upload"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            ไฟล์ทั้งหมดที่เลือกไว้จะใช้แผนกและสิทธิ์เดียวกัน · พนักงานระดับ Manager เข้าถึงได้ทุกไฟล์เสมอ
          </p>

          <Button
            onClick={handleUpload}
            disabled={pendingFiles.length === 0 || uploading || !groupReady}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadStep || "กำลังอัปโหลด"}{uploadProgress ? ` (${uploadProgress.current}/${uploadProgress.total})` : "..."}
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                อัปโหลดและบันทึก{pendingFiles.length > 0 ? ` (${pendingFiles.length} ไฟล์)` : ""}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Document List, one section per department / topic */}
      {documents.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/50 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {configError ? "โหลดรายการเอกสารไม่สำเร็จ ดูแถบแจ้งเตือนด้านบน" : "ยังไม่มีเอกสาร SOP ในฐานความรู้"}
        </div>
      ) : (
        groupDocuments(documents).map((group) => (
          <div
            key={`${group.type}:${group.name}`}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800/50">
              <FolderOpen className="w-4 h-4 text-[#0C645B] dark:text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">{group.name}</h3>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {group.type === "department" ? "แผนก" : group.type === "other" ? "อื่นๆ" : ""} · {group.docs.length} ไฟล์
              </span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-200 dark:border-zinc-800/50 hover:bg-transparent">
                  <TableHead className="text-zinc-500 dark:text-zinc-400">ชื่อไฟล์</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">สิทธิ์การเข้าถึง</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">จำนวนส่วน</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">นำเข้าโดย</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400">อัปเดตล่าสุด</TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400 text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.docs.map((doc) => (
                  <TableRow
                    key={doc.file_id}
                    onClick={() => doc.view_url && openPreview(doc)}
                    onKeyDown={doc.view_url ? onActivateKey(() => openPreview(doc)) : undefined}
                    tabIndex={doc.view_url ? 0 : undefined}
                    aria-label={doc.view_url ? `ดูตัวอย่าง ${doc.title}` : undefined}
                    title={doc.view_url ? `ดู ${doc.title}` : doc.title}
                    className={`border-zinc-200 dark:border-zinc-800/50 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/30 ${
                      doc.view_url ? `cursor-pointer ${FOCUS_RING}` : ""
                    }`}
                  >
                    <TableCell className="max-w-[20rem]">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-4 h-4 text-zinc-500 dark:text-zinc-400 shrink-0" />
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                          {doc.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                      {doc.sop_access ? ACCESS_LABEL[doc.sop_access] : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-600 dark:text-zinc-400">
                      {doc.chunk_count}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-700 dark:text-zinc-300">
                      {doc.uploaded_by || <span className="text-xs italic text-zinc-500 dark:text-zinc-400">ไม่ได้บันทึกไว้</span>}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(doc.updated_at).toLocaleString("th-TH")}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {/* Only docs uploaded here have the original file in Storage. */}
                        {doc.view_url && (
                          <a
                            href={`/api/documents/download?file_id=${encodeURIComponent(doc.file_id)}`}
                            download={doc.title}
                            title={`ดาวน์โหลด ${doc.title}`}
                            className={`${buttonVariants({ variant: "ghost", size: "sm" })} text-zinc-500 dark:text-zinc-400 hover:text-emerald-500 h-8 px-2 items-center gap-1.5`}
                          >
                            <Download className="w-3.5 h-3.5" />
                            ดาวน์โหลด
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(doc)}
                          className="text-zinc-500 dark:text-zinc-400 hover:text-blue-500 h-8 px-2 items-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          แก้ไข
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(doc)}
                          disabled={deletingId === doc.file_id}
                          className="text-zinc-500 dark:text-zinc-400 hover:text-rose-500 h-8 px-2 items-center gap-1.5"
                        >
                          {deletingId === doc.file_id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          ลบ
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))
      )}

      {/* Edit department / access */}
      <Dialog open={!!editingDoc} onOpenChange={(open) => !open && !savingEdit && setEditingDoc(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>แก้ไขแผนกและสิทธิ์การเข้าถึง</DialogTitle>
            <DialogDescription className="truncate">{editingDoc?.title}</DialogDescription>
          </DialogHeader>
          <SopGroupFields
            groupChoice={editGroupChoice}
            onGroupChoice={setEditGroupChoice}
            topic={editTopic}
            onTopic={setEditTopic}
            access={editAccess}
            onAccess={setEditAccess}
            existingTopics={existingTopics}
            disabled={savingEdit}
            idPrefix="edit"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            มีผลกับคำถามถัดไปของบอททันที ไม่ต้องอัปโหลดไฟล์ใหม่ · พนักงานระดับ Manager เข้าถึงได้ทุกไฟล์เสมอ
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingDoc(null)} disabled={savingEdit}>
              ยกเลิก
            </Button>
            <Button
              onClick={saveEdit}
              disabled={savingEdit || !isGroupReady(editGroupChoice, editTopic, editAccess)}
            >
              {savingEdit ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="sm:max-w-4xl w-full max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{previewDoc?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800/50">
            {previewDoc && fileExtension(previewDoc.title) === "pdf" ? (
              <iframe
                src={previewDoc.view_url ?? undefined}
                title={previewDoc.title}
                className="w-full h-[75vh] bg-white"
              />
            ) : previewLoading ? (
              <div className="flex items-center justify-center h-[50vh] text-zinc-500 dark:text-zinc-400 gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังโหลดตัวอย่าง...
              </div>
            ) : previewError ? (
              <div className="flex items-center justify-center h-[50vh] text-rose-500 text-sm">
                {previewError}
              </div>
            ) : previewHtml !== null ? (
              <div
                className="p-6 text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_strong]:font-semibold [&_table]:border-collapse [&_table]:w-full [&_table]:mb-3 [&_td]:border [&_td]:border-zinc-300 [&_td]:dark:border-zinc-700 [&_td]:p-2 [&_th]:border [&_th]:border-zinc-300 [&_th]:dark:border-zinc-700 [&_th]:p-2 [&_th]:bg-zinc-100 [&_th]:dark:bg-zinc-800 [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : previewText !== null ? (
              <pre className="p-6 text-sm whitespace-pre-wrap text-zinc-800 dark:text-zinc-200 font-mono">
                {previewText}
              </pre>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
