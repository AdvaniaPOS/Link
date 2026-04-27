import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind to 0.0.0.0 so phones on the LAN can reach it
    port: 51730,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:18000",
      "/uploads": "http://localhost:18000",
    },
  },
});
