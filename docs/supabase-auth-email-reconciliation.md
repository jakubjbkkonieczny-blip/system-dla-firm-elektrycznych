# VectorWork — Supabase Auth email ↔ business email reconciliation

**Stage:** 3B  
**Status:** Implemented fail-closed policy  
**Database:** Neon remains the Prisma business database

## Sources of truth

| Concern | Source of truth | Field |
|--------|------------------|--------|
| Authentication identity | Supabase Auth | `auth.users.id` + Auth email |
| Business user primary key | VectorWork | `User.id` (cuid) |
| Auth ↔ business link | VectorWork | `User.supabaseAuthUserId` |
| Business / contact email | VectorWork | `User.email` (unique, normalized lowercase) |

Supabase Auth email is authoritative for **login credentials**.  
`User.email` is authoritative for **invitations, transactional mail, display, and first Stripe `customer_email` bootstrap**.

Identity mapping is always:

```text
auth.users.id → User.supabaseAuthUserId → User.id
```

Accounts are **never** linked or merged by unverified email alone.

## What may change after a verified Auth email change

When Auth confirms an email change for an already-linked user, VectorWork may update **only** `User.email` to the normalized Auth email, and only when:

1. The Auth identity is verified (`email_confirmed` / post-confirm callback).
2. A VectorWork user is found by `supabaseAuthUserId` (not by the new email).
3. That user is active.
4. The destination email is free, **or** already belongs to the same `User.id`.
5. `supabaseAuthUserId` on that row still matches the Auth user.

On success:

- `User.id` is unchanged.
- `CompanyMember` rows are unchanged.
- Roles, scopes, ownership are unchanged.
- Stripe customer / subscription identifiers on `User` are unchanged.
- Google token rows remain keyed by `User.id`.
- Notifications remain keyed by `userId`.
- Invitations continue to look up by the (updated) `User.email` unique value.

## What must fail closed

| Situation | Result |
|-----------|--------|
| Unverified Auth email | No `User.email` write (`UNVERIFIED`) |
| No `User` for `supabaseAuthUserId` | No auto-provision via reconcile (`MISSING_USER_MAPPING`) |
| Another `User` already owns destination email | `AUTH_EMAIL_CONFLICT` / `DESTINATION_EMAIL_OWNED` — no merge |
| Conflicting `supabaseAuthUserId` | Fail closed — never overwrite |
| Inactive user | No silent email rewrite during reconcile |
| Stale callback / wrong Auth user | Mapping checks fail closed |

## Explicit non-goals

- Do **not** auto-merge two VectorWork users.
- Do **not** transfer CompanyMember, billing, or Google linkage because Auth email changed.
- Do **not** create a second `User` for the same Auth UUID after an email change.
- Do **not** use the service-role key to force-attach identities by email.

## Application touchpoints

- `lib/supabase/email-reconciliation.ts` — `reconcileBusinessEmailFromVerifiedAuth`
- Auth callback / login paths call reconciliation when a linked user hits an Auth email drift under the safe rules above
- `resolveLinkedUser` remains fail-closed on mismatch; reconciliation is an explicit step before retry

## Operational note

Until a dedicated in-app “change email” UI exists, operators should treat Auth email changes as credential changes that require the destination business email to be unused. If the destination is already a different VectorWork account, support must resolve ownership manually — the system will not merge.
