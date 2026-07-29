# VECTORWORK — Supabase Migration Phase 0

**Date:** 2026-07-29  
**Scope:** External dependency verification only  
**Code impact of this document:** none (findings encoded in `lib/supabase/phase0-dependencies.ts`)

## Verdict

All required Phase 0 external dependencies are **CONFIRMED**.  
Password path for later phases: **bcrypt import with forced-reset fallback**.

No architectural redesign required.

## Dependency matrix

| ID | Topic | Status |
|----|-------|--------|
| bcrypt-hash-import | Admin `createUser({ password_hash })` for bcrypt | **CONFIRMED** |
| auth-admin-apis | Admin create/update/delete user | **CONFIRMED** |
| ssr-app-router | `@supabase/ssr` + Next.js App Router clients | **CONFIRMED** |
| session-handling | Cookie sessions; prefer `getClaims` / `getUser` on server | **CONFIRMED** |
| password-recovery | `resetPasswordForEmail` + `updateUser` | **CONFIRMED** |
| email-verification | Signup confirm + admin `email_confirm` | **CONFIRMED** |
| user-disable-suspension | `ban_duration` on `updateUserById` | **CONFIRMED** |
| reauthentication | `reauthenticate()` + nonce on password update | **CONFIRMED** |

## Official sources (retrieved 2026-07-29)

- https://supabase.com/docs/guides/platform/migrating-to-supabase/auth0
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/reference/javascript/auth-admin-createuser
- https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/reference/javascript/auth-reauthenticate
- https://supabase.github.io/auth-js/v2/interfaces/AdminUserAttributes.html

## Notes for later phases (do not implement now)

1. Staging must validate real VectorWork bcrypt prefixes (`$2a$` / `$2b$` from `bcrypt` cost 10) before production hash import.
2. Auth token refresh at cutover needs the official Next.js Proxy/middleware cookie pattern — not wired in Phase 1.
3. Business authority (roles, `isActive`, deactivation, billing) stays in VectorWork; Auth ban is Auth-side only.
4. Neon remains production PostgreSQL until Stage 4. `DATABASE_URL` / `DIRECT_URL` unchanged.

## STOP

Phase 0 complete. Proceed only with Phase 1 additive preparation.
