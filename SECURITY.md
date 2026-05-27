# Security Policy

If you've found a security issue in Aftertale, please report it privately
before disclosing publicly. We aim to acknowledge reports within 72 hours
and ship a fix or mitigation within 30 days for confirmed issues.

## How to report

- **Email:** snoblitz@gmail.com (subject line: `[security] <short summary>`)
- **Also published at:** [security.txt](https://aftertale.gg/.well-known/security.txt)

Please include:

1. A description of the issue and its potential impact.
2. Steps to reproduce (or a proof-of-concept).
3. Any relevant URLs, request payloads, or screenshots.
4. Whether you'd like to be credited (and by what name) in the changelog.

## Scope

In scope:

- **aftertale.gg** — the production web app and Cloudflare Pages deployment
- **The OpenRouter integration** — key handling, request construction,
  response parsing
- **The Supabase backend** — RLS policies, auth flows, edge functions
- **The WoW addon** (`addon/Aftertale/`) — anything that captures, stores,
  or transmits player data
- **Build & release tooling** in this repository

Out of scope:

- Issues that require physical access to a player's device beyond what
  the player has already granted to themselves
- Reports based purely on missing best-practice headers when no concrete
  exploit is demonstrated (e.g. "your CSP could be tighter") — useful, but
  please open a regular issue
- Social engineering of Aftertale users or staff
- Denial-of-service via brute-force traffic from a single source (handled
  at the Cloudflare layer)

## What we ask

- Give us a reasonable window — **at least 30 days** from acknowledgement
  — before public disclosure.
- Don't exfiltrate more user data than necessary to demonstrate the issue,
  and delete anything you do retrieve once the report is filed.
- Don't run automated scanners that generate significant load.

## What you get

- Acknowledgement within 72 hours.
- A credit line in [CHANGELOG.md](./CHANGELOG.md) with the fix, if you'd
  like one.
- Our gratitude. Aftertale doesn't run a paid bug bounty yet, but as the
  product grows that's the direction we want to head.
