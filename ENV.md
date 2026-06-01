# Configuration

## SDK options (browser)

```javascript
new ASTRAShield({
  appToken:        'your-app-token',  // from `astra connect` — enables server features
  serverVerify:    true,              // proof-of-work attestation (default: on if appToken set)
  adaptiveScoring: true,              // per-app ML anomaly scoring (default: on if appToken set)
  maxChallengeFailures: 3,
  lockoutCooldownMs:    600000,
  telemetryEndpoint: 'https://astra-shield-site.vercel.app/api/events/ingest',
});
```

`serverVerify` and `adaptiveScoring` no-op gracefully if the server can't be
reached — the shield still works client-side.

## Server / dashboard environment variables

Set these on the dashboard deployment (Vercel project settings). Only
`SUPABASE_*` and `JWT_SECRET` are strictly required; the rest unlock hardening
features and degrade gracefully when absent.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-side writes) |
| `JWT_SECRET` | ✅ | Dashboard session signing |
| `ASTRA_SIGNING_SECRET` | recommended | HMAC secret for proof-of-work attestations. Falls back to `JWT_SECRET`. **Set a distinct strong value in production.** |
| `UPSTASH_REDIS_REST_URL` | optional | Cross-instance state (rate limits, nonce replay, beaconing). Falls back to per-instance memory. |
| `UPSTASH_REDIS_REST_TOKEN` | optional | Upstash auth token |
| `ABUSEIPDB_API_KEY` | optional | Second IP-reputation feed. Free tier = 1000 checks/day. |

### JA3/JA4 TLS fingerprinting

Enable Vercel Firewall on the dashboard project so requests arrive with
`x-vercel-ja4-digest` headers. No env var needed — ingest reads the header when
present and falls back silently when not.

## Database migrations

Apply all migrations to your Supabase project:

```bash
cd astra-shield-site && supabase db push
```

This creates: `events`, `daily_stats`, `network_blocks`, `threat_intel`,
`feature_stats`, plus the `increment_daily_stat`, `upsert_subnet_block`,
`contribute_threat_intel`, and `update_feature_stats` RPCs.
