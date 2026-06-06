import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Aftertale ships from Cloudflare Pages at https://aftertale.gg (apex), so
// base is `/`. Kept overridable via env so a one-off GitHub Pages mirror
// would still work if we ever rebuild that.
const base = process.env.AT_BASE ?? '/';

// Build identity, surfaced in-app (VersionBadge) so it's obvious which build is
// live. CF Pages sets CF_PAGES_COMMIT_SHA; fall back to local git, then 'dev'.
function buildSha(): string {
  const cf = process.env.CF_PAGES_COMMIT_SHA;
  if (cf) return cf.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(buildSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
