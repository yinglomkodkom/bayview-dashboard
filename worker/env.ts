// Imported first by worker/index.ts, so it runs before any app module loads
// (src/lib/config.ts reads EMPLOYEE_TABLE as soon as it is imported).
//
// The app reads settings from process.env, as on Vercel. Copy the Worker's
// variables and secrets there so they are found whether or not the runtime
// fills process.env itself. Values already in process.env win.
//
// Secrets must be added under Settings > Variables and Secrets. The
// "Variables and secrets" box under Build only reaches the build, not the
// running Worker (the SOP page failed with "SUPABASE_SERVICE_ROLE_KEY is not
// configured" until they were moved).
import { env } from "cloudflare:workers";

for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
  if (typeof value === "string" && process.env[key] === undefined) process.env[key] = value;
}
