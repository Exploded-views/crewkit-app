import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

// Paths are relative to `root`, which is relative to the repo root (npm scripts run there).
export default defineConfig({
  root: "ui",
  plugins: [svelte({ configFile: false }), svelteTesting({ autoCleanup: false })],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "../dist", emptyOutDir: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,svelte}"],
      exclude: ["src/**/*.test.ts", "src/test-setup.ts", "src/env.d.ts"],
      reporter: ["text", "json-summary", "lcovonly"],
      reportsDirectory: "../coverage/ts",
    },
  },
});
