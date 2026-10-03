import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:5055",
      "/w": "http://localhost:5055",
      "/socket.io": { target: "http://localhost:5055", ws: true },
    },
  },
});
