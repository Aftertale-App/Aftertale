// Tiny build stamp in the corner so it's obvious which build is live in prod.
// Values are injected at build time by vite.config.ts (`define`): the git short
// SHA (CF_PAGES_COMMIT_SHA on Cloudflare, local git otherwise) + build time.

export function VersionBadge() {
  return (
    <div className="at-version-badge" title={`Build ${__APP_VERSION__} · ${__BUILD_TIME__}`}>
      v{__APP_VERSION__}
    </div>
  );
}
