import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";

export default defineConfig({
  // Tailwind v4 runs through its Vite plugin here. `next dev/build` still uses
  // postcss.config.mjs, so an empty PostCSS plugin list keeps Vite from
  // loading it and processing the CSS twice.
  css: { postcss: { plugins: [] } },
  plugins: [
    tailwindcss(),
    // KV-backed data cache (fetch revalidate in lib/gemini-models.ts).
    vinext({ cache: { data: kvDataAdapter() } }),
    // Worker settings live in wrangler.jsonc. The typed cloudflare.config.ts
    // route needs Build Output, which does not support the App Router's
    // rsc + ssr child environment yet ("Could not read the generated
    // Cloudflare Build Output config" at deploy).
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
