import { defineConfig } from 'vite';

// 純靜態部署（GitHub Pages / Netlify / Vercel 皆可）：用相對路徑 base。
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
    host: true,
    // 允許經由 Tailscale（*.ts.net）或區網主機名存取 dev server。
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
  },
});
