// Imported first by worker/index.ts, so it runs before any app module loads
// (src/lib/config.ts reads EMPLOYEE_TABLE as soon as it is imported).
//
// The app reads settings from process.env, as on Vercel. Copy the Worker's
// variables and secrets there, so they are found whether or not the runtime
// fills process.env itself (the SOP page failed with "SUPABASE_SERVICE_ROLE_KEY
// is not configured" although the secret was set).
import { env } from "cloudflare:workers";

export function copyEnv(source: unknown): string[] {
  const copied: string[] = [];
  if (!source || typeof source !== "object") return copied;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (typeof value === "string" && process.env[key] === undefined) {
      process.env[key] = value;
      copied.push(key);
    }
  }
  return copied;
}

export const copiedAtStartup = copyEnv(env);
