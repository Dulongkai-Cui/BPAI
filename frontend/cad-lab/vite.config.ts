import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  base: "/cad-lab/",
  plugins: [vue()],
  root: path.resolve(__dirname),
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/bpai-api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (sourcePath) => sourcePath.replace(/^\/bpai-api/, "/api"),
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
