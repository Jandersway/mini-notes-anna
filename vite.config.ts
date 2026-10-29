import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  build: { outDir: "bundle", emptyOutDir: true, target: "es2022" },
});
