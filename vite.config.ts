// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// When deploying on a self-managed VPS (Contabo / Node), we override Nitro to target a
// Node.js server instead of the default Cloudflare module. In the Lovable sandbox this
// variable is unset, so the default Cloudflare preset remains active.
const isNodeBuild = process.env["WEAVER_BUILD_TARGET"] === "node";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Only override the preset when building for the VPS. Keep the Lovable default for dev/Cloudflare.
  ...(isNodeBuild ? { nitro: { preset: "node" } } : {}),

});


