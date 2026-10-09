"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldCheck, AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignOutLink } from "@/components/auth/sign-out-link";

export default function MfaEnrollPage() {
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const router = useRouter();

  async function startEnrollment() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // ล้าง factor เก่าที่ค้างแบบยังไม่ verified (เช่นรีเฟรชหน้ากลางคัน) ก่อนเริ่มใหม่
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const unverified = existing?.all?.find(
        (f) => f.factor_type === "totp" && f.status === "unverified"
      );
      if (unverified) {
        await supabase.auth.mfa.unenroll({ factorId: unverified.id });
      }

      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator App",
      });

      if (enrollErr) throw enrollErr;

      setFactorId(data.id);
      setQrSvg(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (err) {
      console.error("MFA enroll failed:", err);
      setError("เริ่มตั้งค่า 2FA ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วรีเฟรชหน้านี้");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ต้องเรียก enroll() ตอนโหลดหน้าครั้งแรกเสมอ
    void startEnrollment();
  }, []);

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!factorId || code.trim().length !== 6) {
      setError("กรุณากรอกรหัส 6 หลักจากแอป Authenticator");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyErr } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });

      if (verifyErr) {
        setError("รหัสไม่ถูกต้อง หรือหมดอายุ กรุณาลองใหม่");
        setVerifying(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("MFA enroll verify failed:", err);
      setError("ยืนยันไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-700/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md mx-4 border-zinc-800/50 bg-zinc-900/80 backdrop-blur-xl shadow-2xl shadow-black/50 relative z-10">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-2">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-zinc-100">
            ตั้งค่ายืนยันตัวตน 2 ขั้นตอน
          </CardTitle>
          <CardDescription className="text-zinc-400">
            บัญชีนี้ยังไม่ได้ตั้งค่า 2FA — ต้องตั้งค่าก่อนถึงจะเข้าใช้งาน Dashboard ได้
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-5">
          {error && (
            <div role="alert" className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
                <li>เปิดแอป Google Authenticator หรือ Microsoft Authenticator</li>
                <li>สแกน QR code ด้านล่าง หรือกรอกรหัสด้วยมือ</li>
                <li>กรอกรหัส 6 หลักที่แอปสร้างขึ้นเพื่อยืนยัน</li>
              </ol>

              {qrSvg && (
                <div className="flex justify-center bg-white rounded-xl p-4">
                  {/* supabase-js now returns the QR as a data: URI; injecting it
                      as HTML printed the "data:image/svg+xml;utf-8," prefix as
                      text above the code. */}
                  {qrSvg.startsWith("data:") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={qrSvg} alt="QR code สำหรับแอป Authenticator" className="w-48 h-48" />
                  ) : (
                    <div className="w-48 h-48" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                  )}
                </div>
              )}

              {secret && (
                <div className="text-center">
                  <p className="text-xs text-zinc-500 mb-1">
                    สแกนไม่ได้? กรอกรหัสนี้ด้วยมือแทน:
                  </p>
                  <code className="text-xs text-zinc-300 bg-zinc-800/70 px-2 py-1 rounded break-all">
                    {secret}
                  </code>
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-zinc-300 text-sm">
                    รหัส 6 หลักจากแอป
                  </Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    required
                    disabled={verifying}
                    className="bg-zinc-800/50 border-zinc-700/50 text-zinc-100 text-center text-lg tracking-[0.5em] h-11"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={verifying || code.length !== 6}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                >
                  {verifying ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      กำลังยืนยัน...
                    </span>
                  ) : (
                    "ยืนยันและเปิดใช้งาน"
                  )}
                </Button>
              </form>
            </>
          )}

          <p className="text-center text-xs text-zinc-400">
            สแกน QR ไม่ได้หรือตั้งค่าไม่สำเร็จ ให้ติดต่อแอดมินคนอื่นช่วย
          </p>
          <SignOutLink />
        </CardContent>
      </Card>
    </div>
  );
}
