import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "bayview-dashboard",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-10-09",
    compatibilityFlags: ["nodejs_compat"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      // KV-backed data cache for vinext (fetch revalidate in lib/gemini-models.ts)
      VINEXT_KV_CACHE: bindings.kv(),
    },
  }),
});
