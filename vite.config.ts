import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages project site: https://hplendl.github.io/regarder/
  base: "/regarder/",
  server: {
    host: "0.0.0.0",
    port: 4317,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 4317,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
