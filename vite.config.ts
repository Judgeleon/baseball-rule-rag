import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 只管前端；API 由 Express 提供（dev 下经 proxy 转发，prod 由 Express 托管静态文件）
export default defineConfig({
  plugins: [react()],
  root: "src/client",
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:3000" }
  }
});
