import type { ReactNode } from 'react';

// /privacy and /terms — real SPA routes (served via the public/_redirects
// fallback, the same way /auth/callback is). Lawyer-light by design per the
// launch plan: honest and specific to how Aftertale actually handles data,
// written to be reviewed by counsel before the public (Phase B) launch, not
// after. Plain React so they share the app's styling and need no extra build.

const LAST_UPDATED = 'June 2, 2026';
const CONTACT = 'support@aftertale.gg';

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="at-legal">
      <div className="at-legal-inner">
        <a href="/" className="at-legal-back">← Back to Aftertale</a>
        <h1 className="at-legal-title">{title}</h1>
        <p className="at-legal-updated">Last updated {LAST_UPDATED}</p>
        <div className="at-legal-body">{children}</div>
        <p className="at-legal-foot">
          Questions? Reach us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        Aftertale turns your gameplay into a written chronicle. We've built it to
        collect as little about you as possible. This page explains, in plain
        language, what data is involved and where it goes.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>The Aftertale WoW addon runs entirely on your computer. It makes no
          network connections and sends nothing anywhere on its own.</li>
        <li>You bring your own AI key (OpenRouter). It's stored only in your
          browser and is sent only to OpenRouter when you generate prose.</li>
        <li>If you choose to save your chronicle to an account, we store your
          hero bibles and chapters so they survive a new device. That's it.</li>
        <li>We never collect your World of Warcraft login, Battle.net
          credentials, or payment information.</li>
      </ul>

      <h2>What the addon collects</h2>
      <p>
        The addon records in-game events — quests, level-ups, zone changes,
        deaths, and similar — to a local <code>SavedVariables</code> file on your
        own machine. It is MIT-licensed, opens no network connections, and
        requires no login. Nothing leaves your computer until <em>you</em> choose
        to bring that file into the web app.
      </p>

      <h2>What the web app sends, and to whom</h2>
      <p>
        When you generate a chapter, the relevant game events and your hero
        bible are sent to <strong>OpenRouter</strong>, which routes the request
        to the AI model you've selected (e.g. Anthropic, OpenAI, Google). This is
        the only way to turn your events into prose. Your OpenRouter API key is
        stored in your browser's <code>localStorage</code> and is transmitted
        only to OpenRouter. We never see it or store it on our servers (unless
        you explicitly opt in to sync it across your own devices).
      </p>
      <p>
        Review OpenRouter's privacy practices, and those of your chosen model
        provider, for how they handle the content of requests.
      </p>

      <h2>What we store if you create an account</h2>
      <p>
        Accounts are optional. Without one, your data lives only in your
        browser. If you "Save your chronicle," we store:
      </p>
      <ul>
        <li>Your email address, used solely to sign you in (we use one-time
          email codes; we never store a password).</li>
        <li>The heroes and chronicles you create, so your story is backed up
          and available on a new device.</li>
      </ul>
      <p>
        We don't sell your data, don't run third-party advertising or tracking
        on it, and don't use your chronicles to train models.
      </p>

      <h2>Hosting and infrastructure</h2>
      <p>
        Aftertale runs on established third-party cloud providers for hosting
        and storage. They keep standard server logs (such as IP addresses) for
        security and abuse prevention.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Anonymous data stays in your browser until you clear it. Account data is
        kept until you ask us to delete it. To export or delete your data, email
        us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we'll take care of
        it.
      </p>

      <h2>Changes</h2>
      <p>
        Aftertale is in early testing and this policy may change as the product
        grows. We'll update the date above when it does.
      </p>
    </LegalLayout>
  );
}

export function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        These terms cover your use of Aftertale. Aftertale is in early testing,
        provided free, and offered as-is. By using it, you agree to the
        following.
      </p>

      <h2>Your chronicles are yours</h2>
      <p>
        You own the hero bibles and chronicles you create with Aftertale. We
        claim no ownership over your content. We store it only to provide the
        service (e.g. backing it up to your account if you choose to sign in).
      </p>

      <h2>Bring-your-own-key and costs</h2>
      <p>
        Generating prose uses your own OpenRouter API key. Any AI usage costs
        are billed by OpenRouter to you, under your account and your spending
        controls. Aftertale does not add charges and is not responsible for the
        costs you incur with OpenRouter or any model provider.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Use Aftertale for its intended purpose: chronicling your own gameplay.
        Don't use it to generate unlawful content, to harass others, or to
        attempt to abuse, overload, or reverse-engineer the service. The
        Aftertale addon must be used in accordance with Blizzard's terms; we
        keep it network-free and login-free to stay on the right side of that
        line.
      </p>

      <h2>Third parties</h2>
      <p>
        Aftertale relies on third-party services — OpenRouter and your chosen
        AI model provider (which generate prose from your own key), plus cloud
        infrastructure providers for hosting and storage. Your use of those
        services through Aftertale is also subject to their terms.
      </p>

      <h2>No warranty</h2>
      <p>
        Aftertale is provided "as is," without warranties of any kind. We don't
        guarantee that generated prose will be accurate, that the service will
        be uninterrupted, or that data stored only in your browser won't be lost
        if you clear it. To the extent permitted by law, we are not liable for
        damages arising from your use of the service.
      </p>

      <h2>Not affiliated with Blizzard</h2>
      <p>
        Aftertale is a fan-made tool and is not affiliated with, endorsed by, or
        sponsored by Blizzard Entertainment. World of Warcraft and related marks
        are trademarks of Blizzard Entertainment, Inc.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms as Aftertale evolves. Continued use after an
        update means you accept the revised terms.
      </p>
    </LegalLayout>
  );
}
