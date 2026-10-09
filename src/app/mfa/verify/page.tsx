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
import { KeyRound, AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignOutLink } from "@/components/auth/sign-out-link";

export default function MfaVerifyPage() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  // Starting the 2FA check failed (network, expired session): the form can't
  // work until it is retried, so it is replaced by a retry button.
  const [challengeFailed, setChallengeFailed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    void startChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startChallenge() {
    setLoading(true);
    setError(null);
    setChallengeFailed(false);
    try {
      const supabase = createClient();
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
      if (listErr) throw listErr;

      const factor = factors?.totp?.[0];
      if (!factor) {
        // ไม่มี factor ที่ยืนยันแล้วเลย ต้องไปตั้งค่าใหม่แทน
        router.push("/mfa/enroll");
        return;
      }

      setFactorId(factor.id);

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (challengeErr) throw challengeErr;

      setChallengeId(challenge.id);
    } catch (err) {
      console.error("MFA challenge failed:", err);
      setError("เริ่มการยืนยัน 2 ขั้นตอนไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วกด ลองใหม่");
      setChallengeFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!factorId || !challengeId) {
      setError("ยังเริ่มการยืนยันไม่สำเร็จ กรุณากด ลองใหม่");
      setChallengeFailed(true);
      return;
    }
    if (code.trim().length !== 6) {
      setError("กรุณากรอกรหัส 6 หลักจากแอป Authenticator");
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      });

      if (verifyErr) {
        const { data: { user } } = await supabase.auth.getUser();
        await fetch("/api/auth/login-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user?.email || "-",
            admin_name: user?.user_metadata?.name || user?.email?.split("@")[0] || "-",
            status: "failed",
            notes: "รหัส 2FA (TOTP) ไม่ถูกต้อง หรือหมดอายุ",
          }),
        }).catch(() => {});

        setError("รหัสไม่ถูกต้อง หรือหมดอายุ กรุณาลองใหม่");
        setCode("");
        setVerifying(false);
        // challenge หมดอายุ (ปกติ 5 นาที) ขอ challenge ใหม่ให้อัตโนมัติ
        void startChallenge();
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      await fetch("/api/auth/login-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user?.email || "-",
          admin_name: user?.user_metadata?.name || user?.email?.split("@")[0] || "-",
          status: "success",
          notes: "ยืนยันรหัส 2FA สำเร็จ (เข้าสู่ Dashboard)",
        }),
      }).catch(() => {});

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      console.error("MFA verify failed:", err);
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
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20 mb-2">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-zinc-100">
            ยืนยันตัวตน 2 ขั้นตอน
          </CardTitle>
          <CardDescription className="text-zinc-400">
            กรอกรหัส 6 หลักจากแอป Authenticator ของคุณ
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
          ) : challengeFailed ? (
            <Button type="button" onClick={() => void startChallenge()} className={`w-full h-11 font-medium gap-2 bg-blue-600 hover:bg-blue-700 text-white`}>
              <RotateCcw className="h-4 w-4" />
              ลองใหม่
            </Button>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code" className="text-zinc-300 text-sm">
                  รหัส 6 หลัก
                </Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
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
                  "ยืนยัน"
                )}
              </Button>
            </form>
          )}

          <p className="text-center text-xs text-zinc-400">
            ทำมือถือหายหรือลบแอป Authenticator ไปแล้ว ให้ติดต่อแอดมินคนอื่นกด &ldquo;ล้างค่า 2FA&rdquo; ในหน้า Admin Manage ให้ แล้วเข้าสู่ระบบใหม่เพื่อตั้งค่าอีกครั้ง
          </p>
          <SignOutLink />
        </CardContent>
      </Card>
    </div>
  );
}
