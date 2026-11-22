import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: {
    port: 5173,
    // Autorise l'accès via un tunnel Cloudflare temporaire (partage de démonstration à distance).
    allowedHosts: [".trycloudflare.com"],
    // Même origine pour le front et l'API en développement : le cookie de session reste « SameSite=Strict ».
    proxy: { "/api": { target: "http://localhost:4000", changeOrigin: false }, "/socket.io": { target: "http://localhost:4000", ws: true } },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query", "zustand"],
          forms: ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
  },
});
