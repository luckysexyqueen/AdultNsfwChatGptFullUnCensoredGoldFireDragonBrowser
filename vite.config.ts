import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { copyFile, cp } from "node:fs/promises";

const standaloneFiles = [
  "GoldFireDragonBrowser.html", "inapp-browser.js", "vpn-index-control.js", "vpn-control.js",
  "boot-guard.js", "native-bridge.js", "cordova.js", "cordova_plugins.js", "capacitor.plugins.json",
  "aionspace-vip.js", "hdr.js", "vr_360_enhanced patch script.js", "icon.png", "favicon.ico",
  "placeholder.svg", "robots.txt", "manifest.json", "sw.js", "full_licenses.html", "PublicSuffixDatabase.list"
];
const standaloneDirectories = ["webviews", "fonts", "icon", "images", "img", "lib", "offline"];

function copyStandaloneBrowserAssets() {
  return {
    name: "copy-standalone-browser-assets",
    apply: "build" as const,
    async closeBundle() {
      const root = __dirname;
      const output = path.resolve(root, "dist");
      await Promise.all(standaloneFiles.map(async (file) => {
        try { await copyFile(path.join(root, file), path.join(output, file)); }
        catch (error: any) { if (error?.code !== "ENOENT") throw error; }
      }));
      await Promise.all(standaloneDirectories.map(async (directory) => {
        try { await cp(path.join(root, directory), path.join(output, directory), { recursive: true }); }
        catch (error: any) { if (error?.code !== "ENOENT") throw error; }
      }));
    }
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
    copyStandaloneBrowserAssets(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
