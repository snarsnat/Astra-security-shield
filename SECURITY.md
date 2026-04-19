# ASTRA Shield — Security Architecture (v2.1)

This document describes the server-side defences added in the **Hardened
Edition** upgrade. It is intended for operators and future maintainers.

## Defence layers (in request order)

Every `/api/*` request passes through the following middleware stack before
it reaches a route handler:

| # | Layer | File | What it does |
|---|-------|------|--------------|
| 1 | IP blocklist | `server/index.js` | Hard 403 for any IP on the blocklist. 24h auto-expiry (except permanent admin blocks). |
| 2 | Suspicion ban | `server/security/index.js` (`SuspicionTracker`) | Temporary 429 for IPs that accumulated too many bad signals. |
| 3 | Anti-scraping | `server/security/index.js` (`antiScraping`) | Score-based UA + header-profile check. Blocks known pentest tools (`sqlmap`, `nikto`, `nmap`, …), headless browsers, and requests with no `Accept*` headers. |
| 4 | WAF-lite | `server/security/index.js` (`wafLite`) | Pattern scanner for SQLi / XSS / SSRF / path-traversal / RCE / Log4Shell / template injection across URL, headers and body. |
| 5 | Slow-down tarpit | `server/security/index.js` (`slowDown`) | Progressive latency (up to 5s) for IPs over 50 req/min. Drains attacker resources without 429'ing legitimate bursts. |
| 6 | Global rate limit | `server/index.js` | 200 req/min per IP. |
| 7 | Burst rate limit | `server/index.js` | 30 req per 5s per IP. |
| 8 | Auth rate limit | `server/index.js` | 10 req/min per IP on `/verify`, `/session/*`, `/keys/*`. |
| 9 | Zod validation | `server/routes/api.js` | Strict schema per endpoint. Unknown fields stripped, lengths/types enforced. |
| 10 | API-key auth | `server/middleware/auth.js` | Format probe + constant-time validate + permission check. |

Bad signals from any layer feed back into the `SuspicionTracker`:

* WAF hit → +5
* Honeypot hit → +8
* Scraper pattern → +3
* Auth rate-limit trip → +2
* Global / burst rate-limit trip → +1
* Unknown `/api/` path → +0.5

Scores decay 1.0/minute. Crossing 10 ⇒ 10-minute ban. Crossing 25 ⇒ full
IP block with 24h auto-expiry.

## Key-file hardening

* `~/.astra/api-keys.json` is written atomically (tmpfile + `rename`) with `0600` permissions.
* A 256-bit pepper is loaded from `ASTRA_KEY_PEPPER` env var, or persisted at `~/.astra/pepper` (`0600`).
* Keys are stored as `HMAC-SHA256(pepper, rawKey)`. Legacy bare-SHA256 entries are silently upgraded on first validation.
* Optional `expiresInDays` per key. Expired keys are rejected at validate time.

## Request authentication

* Keys are accepted via `Authorization: Bearer …` or `X-API-Key` headers **only**. The `?apiKey=` query parameter is no longer honoured — query strings end up in web-server logs and `Referer` headers, which is a credential-leak vector.
* A key format probe (`/^astra_[a-z0-9_]+_[A-Za-z0-9_-]{16,64}$/`) is applied before any map lookup. Constant-time compare prevents timing oracles.
* Downstream handlers receive a **sanitised** `req.apiKey` object — the raw hash is not exposed. The hash is kept non-enumerable at `req._apiKeyHash` for the stats endpoint only.

## Honeypots

The following paths are registered as traps. Any hit bumps suspicion by 8 and returns a plain 404:

```
/wp-admin, /wp-login.php, /administrator, /phpmyadmin, /admin.php,
/.env, /.git/config, /config.php, /backup.sql, /.DS_Store,
/xmlrpc.php, /server-status, /actuator, /actuator/env, /console,
/solr/admin, /cgi-bin/, /shell.php, /wls-wsat/
```

## HTTP security headers

`helmet` is configured with:

* `Content-Security-Policy`: `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`.
* `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload` (production only).
* `Cross-Origin-Opener-Policy: same-origin`
* `Cross-Origin-Resource-Policy: same-site`
* `Referrer-Policy: strict-origin-when-cross-origin`
* `X-Frame-Options: DENY`
* `X-Content-Type-Options: nosniff`

Additionally:

* `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()`
* `X-Robots-Tag: noindex, nofollow` — the API must not be indexed.
* `Cache-Control: no-store, max-age=0` — no accidental caching of sensitive responses.

## Body handling

* Body parser limit reduced from `512kb` to `256kb`.
* Raw body captured in `req.rawBody` for future HMAC signature verification (`verifyRequestSignature` in `server/security/index.js`).
* Malformed JSON → clean 400 `malformed_json` (not a 500 stack-trace).
* Oversize payloads → 413 `payload_too_large`.

## Previously-unauthenticated endpoint closed

`POST /api/session/report-threat` was reachable by any client in v2.0 — meaning an attacker could poison the threat-intel store for any IP. It is now `requireAPIKey(['admin'])`.

## Admin endpoints

`/api/admin/blocked-ips`, `/api/admin/blocked-ips/:ip` (DELETE), and the new `/api/admin/suspicion` are all gated on the `admin` permission. The `:ip` param is validated with a strict regex before any mutation.

## Challenge UI hardening

* Fixed a TypeScript-syntax bug in `ui-challenges/pulse-challenge.html` that broke the challenge in every browser (`let tappedAt: number[] = [];` in a plain `<script>` tag).
* Synthetic clicks / touches (`event.isTrusted === false`) are ignored — automation tools that dispatch programmatic events no longer pass the challenge.
* `requestAnimationFrame`-never-fires probe detects headless evaluators that don't run a real render loop.
* `postMessage` calls target the known parent origin instead of `'*'`.
* `alert()` removed — the SDK handles success/failure via postMessage.
* Challenge filename navigation is allow-listed against the known challenge set to prevent open-redirect.

## What v2.1 does NOT claim to do

* **It is not a CDN-scale WAF.** The pattern scanner catches obvious signatures, not every polymorphic payload.
* **It does not inspect TLS/JA3 fingerprints** — that has to happen at the TLS terminator (nginx, Cloudflare). The server does `app.set('trust proxy', 1)` so real-IP detection works behind one.
* **It does not replace a real secret-management system.** The key pepper lives on disk next to the keys by default. For production, set `ASTRA_KEY_PEPPER` from a secret store.
* **Client-side anti-automation signals are reported, not trusted.** The server should weight them but never treat them as proof.

## Configuration via environment

| Var | Default | Effect |
|-----|---------|--------|
| `PORT` | `3001` | Listen port |
| `NODE_ENV` | `development` | `production` enables HSTS, hides error messages |
| `ALLOWED_ORIGINS` | localhost set | Comma-separated CORS allow-list |
| `ASTRA_KEY_PEPPER` | generated | 32-byte hex pepper for API-key HMAC |
| `CHALLENGE_SECRET` | generated | HMAC secret for challenge tokens |
| `ASTRA_NO_LISTEN` | `0` | Set to `1` to import the app without binding a port (tests) |
