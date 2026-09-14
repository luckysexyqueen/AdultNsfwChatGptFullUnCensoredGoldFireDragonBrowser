import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import fs from "node:fs";
import path from "path";

function copyStandaloneBrowser() {
  return {
    name: "copy-standalone-browser",
    generateBundle() {
      const filePath = path.resolve(__dirname, "GoldFireDragonBrowser.html");
      this.emitFile({
        type: "asset",
        fileName: "GoldFireDragonBrowser.html",
        source: fs.readFileSync(filePath),
      });

      const wllamaDir = path.resolve(__dirname, "node_modules/@wllama/wllama/esm");
      const emitWllamaFiles = (directory: string, relativeDirectory = "") => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const sourcePath = path.join(directory, entry.name);
          const relativePath = path.join(relativeDirectory, entry.name);
          if (entry.isDirectory()) {
            emitWllamaFiles(sourcePath, relativePath);
          } else if (/\.(?:js|mjs|wasm)$/i.test(entry.name)) {
            this.emitFile({
              type: "asset",
              fileName: path.posix.join("offline/wllama/esm", relativePath.split(path.sep).join("/")),
              source: fs.readFileSync(sourcePath),
            });
          }
        }
      };
      emitWllamaFiles(wllamaDir);
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  // Nginx·GitHub Pages·모바일 WebView 등 Node.js 없는 정적 호스트에서도 동작하도록 상대 경로를 사용합니다.
  base: './',
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    copyStandaloneBrowser(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
