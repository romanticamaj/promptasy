import { defineConfig } from 'vite';

// 純靜態部署（GitHub Pages / Netlify / Vercel 皆可）：預設相對路徑 base。
// 掛在別人網站的子路徑底下時（例如 garyhsieh.com/promptasy），
// 由上層建置腳本用 PROMPTASY_BASE=/promptasy/ 指定絕對 base。
export default defineConfig({
  base: process.env.PROMPTASY_BASE || './',
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
