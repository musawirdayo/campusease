// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build plugin),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Deploy target:
// - Default (local, Cloudflare, Docker, …): Nitro's cloudflare-module preset via the
//   wrapper — unchanged behavior.
// - Vercel: its build environment always sets VERCEL=1, so we switch the Nitro preset
//   to "vercel" there. Vercel detects TanStack Start + Nitro and runs `npm run build`
//   itself; no other settings needed.
export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
  },
  nitro: process.env.VERCEL ? { preset: "vercel" } : undefined,
});
