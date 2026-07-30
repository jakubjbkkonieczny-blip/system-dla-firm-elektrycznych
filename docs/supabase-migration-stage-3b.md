# VECTORWORK — Supabase Migration Stage 3B

**Date:** 2026-07-30  
**Scope:** Stabilize Supabase Auth for production cutover readiness  
**Database:** Neon remains the only Prisma business database  
**Production:** Untouched — do not set `SUPABASE_AUTH_ENABLED=true` in production in this stage

## Blockers addressed

1. Employer final-deactivation Supabase reauthentication (`verify-deactivation-password.ts`)
2. Inactive-employer recovery capability (bound `deactivated_access` + proxy allowlist)
3. Auth email ↔ business email reconciliation policy (`docs/supabase-auth-email-reconciliation.md`)

## Staging validation scripts

| Script | Purpose |
|--------|---------|
| `scripts/staging/supabase-auth-live-check.mjs` | End-to-end Auth acceptance (Stage 3A/3B) |
| `scripts/staging/session-lifecycle-check.mjs` | Refresh/rotation/revocation/logout checks |

Require:

```bash
SUPABASE_AUTH_ENABLED=true
VECTORWORK_STAGING_AUTH_INTEGRATION=true
```

Temporary Stage 3A diagnostic scripts were removed.

## Rollback

Set `SUPABASE_AUTH_ENABLED=false` (repository default) and restart. Legacy users with `passwordHash` continue; Supabase-only (`passwordHash=null`) cannot legacy-login.
