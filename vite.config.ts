// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

// When deploying on a self-managed VPS (Contabo / Node), we override Nitro to target a
// Node.js server instead of the default Cloudflare module. In the Lovable sandbox this
// variable is unset, so the default Cloudflare preset remains active.
const isNodeBuild = process.env["WEAVER_BUILD_TARGET"] === "node";

function weaverRuntimePlugin() {
  const name = "weaver-runtime-starter";
  let started = false;
  return {
    name,
    apply: "serve",
    async configureServer() {
      if (started) return;
      // لا تبدأ Runtime داخل حاوية Docker/Production — هناك يُدار عبر docker-compose.
      if (process.env["RUNTIME_URL"] && process.env["RUNTIME_URL"] !== "http://127.0.0.1:4100")
        return;
      if (!process.env["EXECUTOR_TOKEN"]) return;

      const health = await fetch("http://127.0.0.1:4100/health", {
        signal: AbortSignal.timeout(1200),
      }).catch(() => null);
      if (health?.ok) return;

      const runtimeRoot = process.env["RUNTIME_ROOT"] ?? "/tmp/weaver-workspaces";
      await mkdir(runtimeRoot, { recursive: true });
      const env = {
        ...process.env,
        RUNTIME_PORT: "4100",
        RUNTIME_ROOT: runtimeRoot,
        RUNTIME_PORT_BASE: "5200",
        RUNTIME_PORT_RANGE: "40",
        PLAYWRIGHT_BROWSERS_PATH: process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? "/opt/ms-playwright",
      };
      const child = spawn("node", ["deploy/runtime/server.mjs"], {
        env,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      started = true;
      console.log(`[weaver-runtime] started runtime (pid ${child.pid})`);
    },
  };
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [weaverRuntimePlugin()],
  },
  // Only override the preset when building for the VPS. Keep the Lovable default for dev/Cloudflare.
  ...(isNodeBuild ? { nitro: { preset: "node" } } : {}),
});
