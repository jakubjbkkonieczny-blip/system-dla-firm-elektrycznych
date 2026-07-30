# VECTORWORK — Supabase Migration Stage 3A

**Date:** 2026-07-30  
**Scope:** Staging activation preparation and end-to-end validation readiness  
**Database:** Neon remains the only Prisma business database  
**Production:** Untouched — `SUPABASE_AUTH_ENABLED` must remain `false`

This stage does **not** implement new Auth features, migrate Neon, or cut over production.

## Goal

Prepare the repository so a dedicated staging environment can safely set:

```bash
SUPABASE_AUTH_ENABLED=true
```

and complete the Auth acceptance checklist without affecting production.

## Official documentation (verified Stage 3A)

| Topic | Source |
|-------|--------|
| SSR clients + Proxy cookies | https://supabase.com/docs/guides/auth/server-side/creating-a-client |
| Next.js App Router SSR | https://supabase.com/docs/guides/auth/server-side/nextjs |
| `getClaims` / `getUser` / `getSession` | Prefer `getClaims` in Proxy; `getUser` for server identity; never trust `getSession` user alone |
| Passwords / recovery | https://supabase.com/docs/guides/auth/passwords |
| PKCE | https://supabase.com/docs/guides/auth/sessions/pkce-flow |
| Publishable key env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

## Required environment variables (staging)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | Staging Neon (not Supabase Postgres) |
| `DIRECT_URL` | yes | Staging Neon direct |
| `SESSION_SECRET` | yes | Still required (legacy path + residual cookie hygiene) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes when Auth on | Staging Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes when Auth on | Publishable / anon — browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | Never `NEXT_PUBLIC_*`; not used for login |
| `SUPABASE_AUTH_ENABLED` | yes | Exactly `true` on staging only |
| `VECTORWORK_STAGING_AUTH_INTEGRATION` | optional | `true` only for real staging e2e job |

### Production restriction

- Do **not** set `SUPABASE_AUTH_ENABLED=true` in production.
- Missing / any value other than exact `true` keeps legacy HMAC auth.

## Migration prerequisites (before enabling the flag on staging)

1. Apply Prisma migrations on **staging Neon** (includes nullable `passwordHash` + `supabaseAuthUserId`).
2. Create a **dedicated non-production** Supabase project (no production customer data).
3. Configure Auth Site URL = staging origin.
4. Allowlist redirects:
   - `{stagingOrigin}/auth/callback`
   - `{stagingOrigin}/auth/confirm`
   - local equivalents only if used for staging rehearsal
5. Enable email confirmation (recommended for staging acceptance).
6. Configure email templates for `/auth/confirm?token_hash=...&type=email&next=...` and/or PKCE callback.
7. Accept trial email limits **or** configure custom SMTP (Auth emails owned by Supabase).
8. Confirm Neon remains Prisma datasource (`DATABASE_URL` / `DIRECT_URL` unchanged target family).

## Staging activation steps

1. Deploy this build to staging with `SUPABASE_AUTH_ENABLED=false` first (smoke legacy).
2. Set staging Supabase public URL + publishable key + service role (server-only).
3. Set `SUPABASE_AUTH_ENABLED=true` on staging only.
4. Restart / redeploy so Proxy and Route Handlers see the flag.
5. Run the manual acceptance checklist below.
6. If Auth is broken or misconfigured, execute rollback (below).

## Rollback procedure (staging)

1. Set `SUPABASE_AUTH_ENABLED=false` (or unset).
2. Redeploy / restart.
3. Confirm legacy HMAC login works for users that still have `passwordHash`.
4. Leave Supabase project intact (no production impact).
5. Do **not** delete Neon data as part of Auth rollback.

Supabase-provisioned users (`passwordHash = null`) cannot use legacy password login — expected. Rollback restores legacy for pre-existing hashed users only.

## Manual staging acceptance (40 checks)

Carry forward from Stage 2A; execute against staging only:

1. Confirm staging-only Supabase project.  
2. Confirm no production customer data.  
3. Confirm Site URL + redirect allowlist are staging-safe.  
4. Confirm SMTP or trial-email limits understood.  
5. Register a synthetic user (`SUPABASE_AUTH_ENABLED=true`).  
6. Confirm password is sent only to Supabase Auth (no Prisma password write).  
7. Confirm `passwordHash` is null / unchanged by Supabase path.  
8. Receive confirmation email via Auth delivery.  
9. Complete email confirmation (`/auth/callback` or `/auth/confirm`).  
10. Confirm exactly one VectorWork `User` row.  
11. Confirm `supabaseAuthUserId` matches `auth.users.id`.  
12. Confirm `User.id` remains a VectorWork cuid.  
13. Confirm no CompanyMember / role / scope / billing from Auth metadata.  
14. Log out.  
15. Confirm protected APIs reject the session.  
16. Log in again.  
17. Confirm session continuity across navigation / server requests.  
18. Confirm protected API resolves expected `User.id`.  
19. Confirm CompanyMember authorization still enforced.  
20. Confirm Auth user without membership is denied company resources.  
21. Request password recovery.  
22. Confirm response does not reveal account existence.  
23. Complete password recovery.  
24. Log in with new password.  
25. Confirm old password rejected by Supabase.  
26. Confirm VectorWork `passwordHash` untouched.  
27. Confirm `sessionVersion` unused/unchanged by Supabase path.  
28. Test invalid callback links.  
29. Test expired callback links.  
30. Test external redirect attempts.  
31. Test encoded open-redirect attempts.  
32. Test Auth identity that cannot be provisioned (email conflict) → denied.  
33. Test conflicting email/mapping (fail closed).  
34. Test inactive employer (see known limitations).  
35. Confirm inactive employer denied normal app access.  
36. Confirm employer recovery business flow remains separate from Auth.  
37. Confirm logout clears Supabase session.  
38. Verify no admin key in browser bundles.  
39. Verify no tokens/passwords/hashes/cookies in app logs.  
40. Verify Neon remains active Prisma database.

### Automated gates (CI / local)

```bash
npx prisma validate
npx tsc --noEmit
npm run build
npm test
npm test -- lib/supabase/__tests__/staging-integration.blocked.test.ts
```

Real Auth e2e against a live staging project requires:

```bash
SUPABASE_AUTH_ENABLED=true
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
VECTORWORK_STAGING_AUTH_INTEGRATION=true
```

Without those credentials, the staging integration test reports **BLOCKED** (not a fake PASS).

## Identity and authorization (unchanged)

```
auth.users.id → User.supabaseAuthUserId → User.id
```

- Business identity and authorization continue to use `User.id`.
- `requireSessionUser` / `requireActiveMember` / ownership / scopes / roles / billing are unchanged.
- Stripe, Google Calendar, and Push continue to authorize via `requireSessionUser()` → `User.id`.

## Known limitations (staging-acceptable / cutover blockers)

| Topic | Staging | Production cutover |
|-------|---------|-------------------|
| Employer final deactivation reauth (`bcrypt` + `passwordHash`) | Supabase-managed users (`passwordHash = null`) receive `AUTH_PASSWORD_REAUTH_REQUIRED` — fail closed | **Blocker:** wire Supabase `reauthenticate()` / secure password change |
| Inactive employer deactivated-access cookie | Supabase login denies inactive accounts (`ACCOUNT_DISABLED`); no deactivated-access mint via Auth | **Blocker:** redesign deactivated employer access without passwordHash |
| Auth email change vs `User.email` | Fail closed (`AUTH_EMAIL_CONFLICT`) — no auto membership/billing transfer | **Blocker:** explicit reconciliation policy |
| Provisioning partial failure | Callback idempotent; login retries Case-1 provision for unlinked confirmed Auth (no email auto-claim) | Monitor; conflicts still fail closed |
| Service role | Not used for login/register/session | Keep isolated from browser |

## Security expectations

- Fail closed when Auth is enabled but misconfigured.
- No silent fallback to legacy HMAC while `SUPABASE_AUTH_ENABLED=true`.
- Safe redirects only (`safeRedirectPath`).
- Callback / confirm validate code or `token_hash`+type.
- Recovery responses do not enumerate accounts.
- Service role never exposed to the browser.
- Proxy uses `getClaims()` for session refresh; route handlers use `getUser()` for identity.

## Observability categories

`AUTH_CONFIGURATION_ERROR`, `AUTH_UNAUTHENTICATED`, `AUTH_CALLBACK_INVALID`, `AUTH_CALLBACK_EXPIRED`, `AUTH_USER_UNLINKED`, `AUTH_USER_CONFLICT`, `AUTH_USER_INACTIVE`, `AUTH_EMAIL_CONFLICT`, `AUTH_PROVIDER_UNAVAILABLE`, `AUTH_PROVISIONING_FAILED`, `AUTH_PASSWORD_RECOVERY_INVALID`, `AUTH_PASSWORD_REAUTH_REQUIRED`, `AUTH_MODE_MISMATCH`.

## STOP

Stage 3A ends at staging readiness / validation reporting.

Do **not** begin Stage 3B, production cutover, Neon migration, or legacy Auth removal.
