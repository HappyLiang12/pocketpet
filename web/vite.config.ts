import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "/assets/web/",
  build: {
    outDir: resolve(root, "../dist/web"),
    emptyOutDir: true,
    manifest: "manifest.json",
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        setup: resolve(root, "src/setup/main.ts"),
      },
    },
  },
});
