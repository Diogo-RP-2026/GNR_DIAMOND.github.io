// Build estático opcional para GitHub Pages: mantém o build TanStack Start original.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  base: process.env["PAGES_BASE_PATH"] || "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  define: { "import.meta.env.VITE_STATIC_PAGES": JSON.stringify("true") },
  build: {
    outDir: "dist-pages",
    rolldownOptions: { input: fileURLToPath(new URL("./pages/index.html", import.meta.url)) },
  },
});
