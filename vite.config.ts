// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      // xlsx (SheetJS) has no "exports" field, only "main"/"module"/"browser".
      // Some bundler/package-manager combinations (e.g. bun install + Rolldown on
      // Cloudflare Pages) fail to resolve it in the SSR build. Pin it explicitly
      // to its ESM entry (absolute path) to remove the ambiguity.
      alias: {
        xlsx: require.resolve("xlsx/xlsx.mjs"),
      },
    },
  },
});
