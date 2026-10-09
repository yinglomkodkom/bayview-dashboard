# Bayview Dashboard + LINE Bot — Setup

ระบบ Admin Dashboard (Next.js) + AI Chatbot ผ่าน LINE OA (n8n) สำหรับพนักงานโรงแรม The Bayview Pattaya ถามข้อมูล SOP/ติดต่อพนักงานผ่านแชท และแอดมินจัดการทุกอย่างผ่านหน้าเว็บ

---

## ภาพรวมระบบ

| ส่วน | เทคโนโลยี | หน้าที่ |
|---|---|---|
| Dashboard | Next.js (App Router) + Supabase Auth | หน้าเว็บแอดมิน ดูสถิติ จัดการพนักงาน อัปโหลด SOP ตั้งค่าบอท |
| Database | Supabase (Postgres + pgvector + Realtime + Storage) | เก็บข้อมูลพนักงาน, log การสนทนา, ฐานความรู้ SOP (vector search), ไฟล์ต้นฉบับ |
| Chatbot | n8n (RAG AI Agent) + Google Gemini | รับข้อความจาก LINE OA, ค้นข้อมูล SOP, ตอบกลับ |
| Deploy | Docker (self-hosted, ไม่ใช่ Vercel) | รันเป็น container เดียวผ่าน `docker-compose.yml` |

เพจในแดชบอร์ด (`src/app/dashboard/`):
- **Overview** — สถิติรวม, กราฟการใช้งานรายวันแยกตามสถานะ (Success/Not Found/Unauthorized/Error), Recent Activity
- **Analytics & Insights** — Top FAQs, ช่วงเวลาที่ใช้งานหนาแน่น (24 ชม.), สถิติแยกตามแผนกจริง
- **Users & Chat Logs** — ประวัติการสนทนาทั้งหมด แบบ **real-time** (ไม่ต้องกด F5) พร้อมตัวกรองขั้นสูง
- **Employee Management** — จัดการพนักงาน แผนก ตำแหน่ง สิทธิ์ (staff/manager) การผูก LINE ID
- **SOP Documents** — อัปโหลดไฟล์ PDF/DOCX/TXT/MD เข้าฐานความรู้ของบอทโดยตรง (ลากวาง, ดูตัวอย่างในหน้าได้เลย, ไม่ต้องผ่าน Google Drive/n8n)
- **Settings** — System Prompt, System Message, เลือกโมเดล Gemini ที่ใช้ (ตอบคำถาม/ค้นเอกสาร), เปิด-ปิดบอท

---

## ⚠️ ตอนนี้ต่อกับตาราง `employee_test` ไม่ใช่ `employee_registry`

ทั้ง Dashboard และ n8n workflow ชี้ไปที่ตาราง **`employee_test`** (สลับจาก `employee_registry` ตามคำขอเดิม)

`employee_test` มีข้อมูลจริงอยู่แล้วหลายคน — กรอกแผนก/ตำแหน่ง/อีเมล/LINE ID ให้ครบผ่านหน้า Employee Management

**ถ้าต้องการสลับกลับไปใช้ `employee_registry`** (ตารางเดิม 136 คน) แจ้งได้ จะสลับ table ในทุกจุดกลับให้ (dashboard query 4 จุด + n8n node)

---

## 2FA (สองชั้น แยกคนละกลุ่มผู้ใช้)

**แอดมิน (เข้าแดชบอร์ด)**: TOTP ผ่านแอป Authenticator (Google Authenticator ฯลฯ) — ตั้งค่าตอน login ครั้งแรก

**พนักงาน (ผูก LINE เพื่อคุยกับบอท)**: Email OTP ผ่านแชท
1. พิมพ์รหัสพนักงาน 4 หลัก (เช่น `1001`) ในแชท LINE
2. บอทส่งรหัส OTP 6 หลักไปที่อีเมลบริษัทที่มีอยู่ในระบบ
3. พิมพ์รหัส 6 หลักกลับมาในแชทภายใน 10 นาที
4. ยืนยันสำเร็จ → ผูก LINE ID อัตโนมัติ

กติกา: รหัสพนักงานที่ผูก LINE ไว้แล้วหรือถูกปิดใช้งาน (`disabled`) ผูกซ้ำเองไม่ได้ ต้องให้แอดมินจัดการผ่านแดชบอร์ด

---

## ตั้งค่าครั้งแรก (จากศูนย์)

### 1) Supabase — รัน SQL ตามลำดับ (SQL Editor)

`supabase_schema.sql` → `supabase_migrations/01` ถึง `07`

### 2) Supabase — ตั้งค่าเพิ่มสำหรับฟีเจอร์ RAG/SOP Documents

ส่วนนี้ไม่ได้อยู่ใน schema เดิม ต้องเช็ค/ทำเพิ่มถ้ายังไม่มี:

- **Extension**: เปิด `pgvector` (Database → Extensions)
- **ตาราง `documents1`**: เก็บ chunk เนื้อหา SOP + embedding (`vector(3072)`, ต้องตรงกับโมเดล `gemini-embedding-001` ที่ใช้ตอนอัปโหลด) คอลัมน์หลัก: `title`, `content`, `embedding`, `metadata` (jsonb: `file_id`, `title`, `chunk_index`), `created_at`, `updated_at`
- **Function `match_documents1(query_embedding, match_count, filter)`**: vector search แบบไม่มี threshold (ใช้กับ retrieval tool หลัก)
- **Function `match_documents(query_embedding, match_count, filter, match_threshold)`**: มี threshold กรองผลลัพธ์ ค่า default ปัจจุบันตั้งไว้ที่ **0.6** (เดิม 0.72 — เปลี่ยนเพราะ query สั้นๆ อย่างชื่อย่อ/ตำแหน่งงานมักได้ similarity แถวๆ 0.65-0.72 ถ้าตั้งสูงกว่านี้จะกรองผลลัพธ์ที่ถูกต้องทิ้งไปหมด)
- **Storage bucket `sop-documents`**: private bucket เก็บไฟล์ต้นฉบับที่อัปโหลดผ่านหน้า SOP Documents (ให้กด "ดู" ในหน้าเว็บได้โดยไม่ต้องดาวน์โหลด)
- **Realtime**: เปิด publication ให้ตาราง `chat_logs` เพื่อให้หน้า Users & Chat Logs อัปเดตแบบ real-time
  ```sql
  alter publication supabase_realtime add table public.chat_logs;
  ```
  ตาราง `chat_logs` ต้องมี RLS policy ที่ยอมให้ผู้ใช้ที่ login แล้ว (`is_admin()`) SELECT ได้ ไม่งั้น Realtime จะไม่ส่งอีเวนต์มาเลย (เงียบๆ ไม่ error)

### 3) กรอกอีเมล + แผนก/ตำแหน่ง ให้ครบใน `employee_test`

ผ่านแดชบอร์ด → หน้า Employee Management → กด "แก้ไข" ทีละคน

### 4) ตั้งค่า SMTP credential ใน n8n

n8n → Settings → Credentials → New → "SMTP" → กรอก Host/Port/User/Password ของบริการส่งอีเมลที่ใช้ (Gmail App Password, Office 365, SendGrid ฯลฯ)

### 5) Import workflow เข้า n8n

Node ที่ต้องเลือก credential เอง:
- `Send OTP Email` → เลือก SMTP credential จากขั้นตอนที่ 4 และแก้ From Email ให้ตรงกับโดเมนจริง
- Node อื่นใช้ credential เดิม (Supabase + LINE Header Auth + Google Gemini)

โหนดสำคัญที่ต้องรู้จัก (สำหรับใครมาดูแล workflow ต่อ):
- **`RAG AI Agent`** — สมองหลักของบอท มี field 2 ช่องที่ผูกกับหน้า Settings ของแดชบอร์ด (อ่านค่าจากตาราง `system_settings` ไม่ได้ hardcode ในโหนด):
  - "Prompt (User Message)" ↔ คอลัมน์ `system_prompt`
  - "System Message" ↔ คอลัมน์ `system_message`
- **`Google Gemini Chat Model3`** — โมเดลที่ตัวบอทใช้ตอบ ↔ `selected_model` ในหน้า Settings
- **`Google Gemini Chat Model2`** — โมเดลที่ป้อนเข้าเครื่องมือค้นเอกสาร (Retrieve Documents) ↔ `retrieval_model` ในหน้า Settings
- **`Retrieve Documents`** (Supabase Vector Store tool) — เรียก `match_documents1` หรือ `match_documents` เพื่อค้น `documents1`; ไฟล์ที่อัปโหลดผ่านหน้า SOP Documents ของแดชบอร์ดจะเข้าไปอยู่ในตารางเดียวกันนี้โดยตรง ไม่ต้องผ่าน Google Drive
- **Memory node** (ผูกกับ `RAG AI Agent`) — Session ID **ต้องผูกกับ LINE user ID** (เช่น `source.userId` จาก webhook payload) ไม่ใช่เนื้อหาข้อความ ไม่งั้นบอทจะไม่มีความจำต่อเนื่องข้ามข้อความเลย (แต่ละข้อความกลายเป็นคนละ session)

---

## ติดตั้งและรันเครื่อง dev

```bash
npm install
cp .env.example .env.local   # แล้วกรอกค่าจริงตามด้านล่าง
npm run dev
```

### Environment Variables

โปรเจกต์นี้ใช้ **2 ไฟล์ env แยกหน้าที่กัน** เพราะ Next.js + Docker ต้องการตัวแปรชุดเดียวกันคนละจังหวะ:

- **`.env.local`** — env หลัก ใช้ตอน container **รัน** (runtime) — ต้องมีครบทุกตัวด้านล่าง
- **`.env`** — ใช้แค่ตอน Docker **build** เพื่อฝัง `NEXT_PUBLIC_*` ลง JS bundle ฝั่ง browser (ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` ของ Next.js ต้องมีค่าตั้งแต่ตอน build ไม่ใช่ runtime) — ใส่แค่ 2 ตัวที่ขึ้นต้น `NEXT_PUBLIC_` ก็พอ ซ้ำกับใน `.env.local` ได้เลย

| ตัวแปร | อยู่ไฟล์ไหน | ใช้ทำอะไร |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env` + `.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env` + `.env.local` | Supabase anon key (ฝั่ง browser) |
| `N8N_WEBHOOK_URL` | `.env.local` | ปุ่ม Broadcast/DM และดึงโปรไฟล์ LINE ในหน้า Employees |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` | จำเป็นสำหรับหน้า **SOP Documents** — ตาราง `documents1` เปิด RLS แต่ไม่มี policy ให้ role อื่น ต้องใช้ service role อ่าน/เขียนฝั่ง server |
| `GOOGLE_API_KEY` | `.env.local` | สร้าง embedding (`gemini-embedding-001`) ตอนอัปโหลดไฟล์ SOP — ต้องเป็น key เดียวกับที่ n8n credential "Google Gemini (PaLM) Api account" ใช้ ไม่งั้น dimension/โมเดลไม่ตรงกับของเดิมใน `documents1` |

`.env.example` ไม่ได้ถูกอ้างอิงจากที่ไหนในโค้ดเลย (แค่เก็บไว้เป็นแม่แบบอ่านเอง) และไม่ถูก commit ขึ้น git (`.gitignore` บล็อก `.env*` ทั้งหมด)

---

## Deploy (Docker — วิธีที่ใช้งานจริง)

```bash
docker compose up --build -d
```

`docker-compose.yml` จะ:
1. อ่าน `.env` เพื่อแทนค่า `${NEXT_PUBLIC_*}` เป็น build args ตอน build image
2. รัน container โดยโหลด runtime env จาก `.env.local` (ผ่าน `env_file:`)
3. เปิดพอร์ต `3000:3000`

**ทุกครั้งที่แก้โค้ด** (ไม่ว่าจะเป็นหน้าเว็บ, API route, System Prompt default ในโค้ด ฯลฯ) ต้องรัน `docker compose up --build -d` ใหม่เสมอ ถึงจะขึ้น production จริง — ยกเว้นการแก้ค่าใน Supabase โดยตรง (เช่น System Prompt ผ่านหน้า Settings หรือ SQL) ซึ่งมีผลทันทีไม่ต้อง rebuild

ก่อน commit/deploy แนะนำเช็คตามลำดับนี้เสมอ:
```bash
npx tsc --noEmit        # typecheck
npx eslint <ไฟล์ที่แก้>   # lint
npm run build            # production build จริง (จับ error ที่ dev mode ไม่เจอ เช่น CSS syntax)
docker compose up --build -d
```

---

## ธีมสี + โลโก้

ธีมปัจจุบันชื่อ **"Sundeck Teal"** (เขียวทะเลเข้ม + ทรายทอง) กำหนดไว้ 2 ชั้นใน `src/app/globals.css`:
1. Override ทับสี default ของ Tailwind (`zinc` → teal-เทาอมเขียว, `blue` → teal หลัก) ใน `@theme` block — ทำให้ทุก `bg-zinc-*`/`text-blue-*` ที่ hardcode กระจายอยู่ทั่วแอปเปลี่ยนสีอัตโนมัติ
2. CSS variables ปกติ (`:root` / `.dark`) สำหรับ shadcn primitives (Button, Input, Badge ฯลฯ)

สีสถานะ (Success/Not Found/Unauthorized/Error — เขียว/เหลือง/ม่วง/แดง) แยกเป็นสี**สื่อความหมาย** ไม่ผูกกับธีม อยู่ที่ `src/components/dashboard/status-badge.tsx` จุดเดียว ใช้ร่วมกันทั้ง Recent Activity, Users & Chat Logs, และกราฟ Overview

โลโก้ (`public/bayview-mark.png`, `src/app/icon.png` = favicon) แปลงมาจากไฟล์ Illustrator (`.ai`) ต้นฉบับ — ถ้าต้องเปลี่ยนโลโก้ใหม่ทีหลัง ไฟล์ `.ai`/`.pdf` แปลงเป็น PNG ได้ตรงๆ ด้วย `pdfjs-dist` (มีอยู่แล้วใน dependencies) ไม่ต้องพึ่งโปรแกรม Illustrator

## Deploy บน Cloudflare Workers (vinext)

แอปนี้ build เป็น Cloudflare Worker ได้ผ่าน [vinext](https://vinext.dev/) โดย `next dev` / `next build` / Docker ใช้ต่อได้ตามเดิม

- `vite.config.ts`, `wrangler.jsonc` — config ของ vinext + Worker (ชื่อ `bayview-dashboard` ต้องตรงกับชื่อบน Cloudflare, KV binding `VINEXT_KV_CACHE` ใช้เป็น data cache ซึ่ง Wrangler สร้างให้ตอน deploy ครั้งแรก). ห้ามกลับไปใช้ `cloudflare.config.ts`: แบบนั้น deploy พังด้วย "Could not read the generated Cloudflare Build Output config" เพราะยังไม่รองรับ App Router
- สคริปต์: `npm run dev:vinext`, `npm run build:vinext`, `npm run deploy:vinext`
- Workers Builds (Git): Build command `npm run build:vinext`, Deploy command `npx vinext-cloudflare deploy --skip-build`
- ตัวแปร env: `NEXT_PUBLIC_*` ใส่ที่ **Build variables and secrets**; ตัวแปรลับ (`SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`, `N8N_WEBHOOK_URL`, `N8N_ADMIN_REPLY_URL`) ใส่เป็น secret ของ Worker
- แผนฟรีมี CPU 10 ms/request — แนะนำ Workers Paid สำหรับใช้งานจริง (โดยเฉพาะการอัปโหลดเอกสาร SOP ที่แกะ PDF/DOCX)
- มีไฟล์ `.npmrc` (`legacy-peer-deps=true`) เพราะ shadcn ดึง @babel/core 7 ชนกับ peer ของ vinext — ทำให้ `npm ci` บน Cloudflare ผ่าน
