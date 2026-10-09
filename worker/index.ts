/// <reference types="vite/client" />
/// <reference types="@vitejs/plugin-rsc/types" />
// Cloudflare Worker entry: vinext's own handler, with every route's code
// loaded while the Worker starts instead of on its first request.
//
// The free plan allows 10 ms of CPU per request but 1 s at startup. vinext
// imports a route's modules lazily, so the first visit to each page in a
// fresh isolate spent 100+ ms loading code and failed with Error 1102
// ("Worker exceeded CPU time limit"). Loading it all here moves that cost
// into startup.
import handler from "vinext/server/app-router-entry";

// Server components, layouts and route handlers (rsc environment). Awaited
// here so the chunks vinext would import on demand are already evaluated.
await Promise.all(
  Object.values(
    import.meta.glob([
    "/src/app/**/{page,layout,loading,error,not-found,route}.{ts,tsx}",
    "/src/middleware.ts",
  ])
  ).map((load) => load())
);

// The ssr environment (HTML rendering of client components) is a separate
// bundle that vinext otherwise imports on the first page request.
await import.meta.viteRsc.loadModule("ssr", "index");

export default handler;
