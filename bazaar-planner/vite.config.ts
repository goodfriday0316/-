import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const privacyPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "private-local-file-policy",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content: privacyPolicy,
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
});
