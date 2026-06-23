import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri-aware Vite config.
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  // Tauri expects a fixed port and a clean console.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Don't watch the Rust side from Vite — the Tauri CLI handles it.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "es2021",
    sourcemap: true,
  },
});
