# VECTORWORK — Supabase Migration Stage 2A

**Date:** 2026-07-29  
**Scope:** Complete Supabase Auth path behind disabled `SUPABASE_AUTH_ENABLED`  
**Database:** Neon remains the only Prisma business database  
**Default:** `SUPABASE_AUTH_ENABLED=false` (legacy HMAC auth unchanged)

## Documentation verification (official sources)

Retrieved/verified 2026-07-29 before implementation:

| Topic | Official source |
|-------|-----------------|
| SSR clients + Proxy / cookies | https://supabase.com/docs/guides/auth/server-side/creating-a-client |
| Next.js App Router SSR | https://supabase.com/docs/guides/auth/server-side/nextjs |
| Publishable key env names | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Password signup / recovery | https://supabase.com/docs/guides/auth/passwords |
| PKCE | https://supabase.com/docs/guides/auth/sessions/pkce-flow |
| `getClaims` / `getUser` / `getSession` | SSR creating-a-client guide (do not trust `getSession` user alone on server) |
| `@supabase/ssr` (not auth-helpers) | https://www.npmjs.com/package/@supabase/ssr |

No Phase 0 assumption required a redesign. Minor schema defect fixed (below).

## Blocking schema defect (unavoidable migration)

`User.passwordHash` was required (`String`). Stage 2A forbids writing the user’s password (or its hash) on the Supabase path.

**Adjustment:** migration `20260729220000_user_password_hash_nullable` makes `passwordHash` nullable.  
Supabase-provisioned users get `passwordHash: null`. Legacy users keep hashes. Legacy login fails closed when `passwordHash` is null.

## Feature-flag contract

| Flag | Behavior |
|------|----------|
| `SUPABASE_AUTH_ENABLED` unset / not exactly `true` | Legacy HMAC cookie auth only. Missing Supabase env must not break build/runtime. |
| `SUPABASE_AUTH_ENABLED=true` | Supabase Auth only for designated flows. No silent fallback to legacy. Neon stays Prisma datasource. |

## Architecture boundaries

- **Supabase Auth:** identity, passwords, sessions, cookies, confirmation, recovery, rate limits.
- **VectorWork:** `User.id`, companies, roles, scope, billing, business authorization.
- Mapping: `auth.users.id` → `User.supabaseAuthUserId` → `User.id` (permanent business PK).

## Email ownership policy

- Supabase Auth is the authentication-email authority.
- `User.email` remains a business/contact field (normalized lowercase).
- Linking never silently replaces a conflicting non-null `supabaseAuthUserId`.
- **Deferred (cutover blocker):** automatic reconciliation of Auth email changes that would transfer CompanyMember / billing access. Stage 2A fails closed on email mismatch (`AUTH_EMAIL_CONFLICT`).

## Employer deactivation reauthentication (cutover blocker)

Employer final deactivation still uses `bcrypt.compare` against `passwordHash`.  
Supabase-managed users (`passwordHash = null`) receive `AUTH_PASSWORD_REAUTH_REQUIRED` and are denied — fail closed, no custom password verification invented.

**Before production Auth cutover:** wire official Supabase `reauthenticate()` / secure password change into the deactivation finalization path.

## Routes added / adapted

| Route | Role |
|-------|------|
| `GET /auth/callback` | PKCE `exchangeCodeForSession` + provisioning |
| `GET /auth/confirm` | `verifyOtp` token_hash confirmation |
| `GET /auth/error` | Safe user-facing Auth error |
| `GET /auth/reset-password` | Recovery password completion UI |
| `POST /api/auth/forgot-password` | `resetPasswordForEmail` (generic response) |
| `POST /api/auth/recovery/complete` | `updateUser({ password })` |
| Existing `/api/auth/session`, `/register`, `/api/me/password` | Branch on flag |

## Rate limiting / abuse

| Control | Owner |
|---------|-------|
| Auth login / recovery / signup throttles | Supabase Auth |
| Outer `/api/*` IP rate limit in `proxy.ts` | VectorWork (unchanged) |
| Account enumeration on forgot-password | Prevented via generic `{ ok: true }` |

## Partial failure handling

1. Signup OK, provisioning fails → no business access; retry via callback is idempotent.  
2. Link conflict → no overwrite; safe conflict.  
3. Login OK, unmapped → deny; no email auto-claim.  
4. Supabase down (mode on) → fail closed (`AUTH_PROVIDER_UNAVAILABLE`).  
5. Neon down after Auth OK → not authorized; no alternate credentials.

## Staging configuration checklist

Use a **dedicated non-production** Supabase project only.

- [ ] Project is staging-only; no production customer data  
- [ ] `NEXT_PUBLIC_SUPABASE_URL`  
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable / anon — browser-safe)  
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (server-only; never `NEXT_PUBLIC_*`)  
- [ ] `SUPABASE_AUTH_ENABLED=true` **only** in staging/dev  
- [ ] Site URL = staging origin  
- [ ] Redirect allowlist includes:  
  - `http://localhost:3000/auth/callback`  
  - `http://localhost:3000/auth/confirm`  
  - staging `/auth/callback` and `/auth/confirm`  
  - production placeholders (do not enable until cutover)  
- [ ] Email confirmation enabled  
- [ ] Secure password policy enabled as desired  
- [ ] Session / JWT settings reviewed  
- [ ] Auth rate limits reviewed  
- [ ] CAPTCHA decision recorded  
- [ ] Custom SMTP configured **or** trial email limits explicitly accepted for staging  
- [ ] Email templates point to `/auth/confirm?token_hash=...&type=email&next=...` and/or PKCE callback  
- [ ] Sender domain authentication (SPF/DKIM) for production SMTP later  
- [ ] Leaked-password protection if available  
- [ ] Test-user isolation (synthetic emails only)  
- [ ] Neon `DATABASE_URL` / `DIRECT_URL` unchanged  

### SMTP rule

Supabase owns Auth emails. For production, configure custom SMTP in the Supabase dashboard (Resend may be used as that SMTP provider). Do not send signup/reset Auth mail from VectorWork Resend code.

## Manual staging acceptance (40 checks)

1. Confirm staging-only Supabase project.  
2. Confirm no production customer data.  
3. Confirm Site URL + redirect allowlist are staging-safe.  
4. Confirm SMTP or trial-email limits understood.  
5. Register a synthetic user (`SUPABASE_AUTH_ENABLED=true`).  
6. Confirm password is sent only to Supabase Auth (network tab / no Prisma password write).  
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
32. Test Auth user with no VectorWork mapping (denied).  
33. Test conflicting email/mapping (fail closed).  
34. Test inactive employer.  
35. Confirm inactive employer denied normal app access.  
36. Confirm employer recovery business flow remains separate from Auth.  
37. Confirm logout clears Supabase session.  
38. Verify no admin key in browser bundles.  
39. Verify no tokens/passwords/hashes/cookies in app logs.  
40. Verify Neon remains active Prisma database.

## Observability categories

`AUTH_CONFIGURATION_ERROR`, `AUTH_UNAUTHENTICATED`, `AUTH_CALLBACK_INVALID`, `AUTH_CALLBACK_EXPIRED`, `AUTH_USER_UNLINKED`, `AUTH_USER_CONFLICT`, `AUTH_USER_INACTIVE`, `AUTH_EMAIL_CONFLICT`, `AUTH_PROVIDER_UNAVAILABLE`, `AUTH_PROVISIONING_FAILED`, `AUTH_PASSWORD_RECOVERY_INVALID`, `AUTH_PASSWORD_REAUTH_REQUIRED`.

## STOP

Stage 2A ends here. Do not enable production cutover, import passwords, migrate Neon, or remove legacy auth.
