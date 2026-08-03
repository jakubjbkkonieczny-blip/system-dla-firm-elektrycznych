# Stage 4G-B — Production readiness (pre–Stage 4H)

Closes Stage 4G blockers without performing production cutover.

**This stage must NOT:**

- switch production traffic
- change production `DATABASE_URL` / `DIRECT_URL`
- enable production Supabase Auth (`SUPABASE_AUTH_ENABLED` stays `false`)
- bulk-import production Auth users
- modify production Neon business data (read-only)
- initialize/populate real production Supabase without separate human authorization

Staging Supabase project (never production):

`yzezdhwffgamtmozmfse`

---

## Tooling map

| Concern | Library | CLI |
|--------|---------|-----|
| Target guard | `lib/migration/production/target-guard.ts` | used by all write CLIs |
| Business export | `lib/migration/production/copy/export-business.ts` | `scripts/production/export-business.ts` |
| Business import | `lib/migration/production/copy/import-business.ts` | `scripts/production/import-business.ts` |
| Copy dry-run | `lib/migration/production/copy/dry-run.ts` | `scripts/production/copy-dry-run.ts` |
| Auth orchestrator | reuses `lib/supabase/auth-migration/*` | `scripts/production/auth-migrate.ts` |
| Auth rollback | `lib/migration/production/auth/rollback.ts` | `scripts/production/auth-rollback.ts` (**not for 4G-B**) |
| Validator | `lib/migration/production/validate/compare.ts` | `scripts/production/validate-neon-supabase.ts` |
| Freeze verifier | `lib/migration/production/freeze/snapshot.ts` | `scripts/production/freeze-verify.ts` |
| Stage 4H GO/NO-GO | `lib/migration/production/preflight/stage4h-gates.ts` | `scripts/production/stage4h-preflight.ts` |
| Target inventory | — | `scripts/production/inventory-target.ts` |

Artifacts default to a **sibling directory outside git**:

`../vectorwork-migration-artifacts`

Override with `VECTORWORK_MIGRATION_ARTIFACT_DIR`.

---

## Production target identity

Operator must supply a verified production Supabase project ref that **differs** from staging.

Write tooling requires:

```text
--confirm-production-project-ref <ref>
```

Confirmation is never inferred from env alone.

Optional env (name only; never commit value):

```text
VECTORWORK_EXPECTED_PRODUCTION_PROJECT_REF=
```

If identity cannot be proven from local config:

`PRODUCTION_TARGET_IDENTITY_UNCONFIRMED`

---

## Business copy

### Export (Neon, SELECT-only)

```bash
npx tsx scripts/production/export-business.ts --env-file <neon-env> --out <protected-dir>
```

Exports all 21 business tables as JSONL + SQL + `manifest.json` with counts and deterministic hashes.

### Dry-run (no writes)

```bash
npx tsx scripts/production/copy-dry-run.ts \
  --source-env-file <neon-env> \
  --dest-env-file <prod-supabase-env> \
  --confirm-production-project-ref <ref>
```

Exits 0 only when `COPY_DRY_RUN_SAFE` and `WRITES_ENABLED=false`.

### Import (explicit execute only)

```bash
npx tsx scripts/production/import-business.ts \
  --export-dir <dir> \
  --env-file <prod-supabase-env> \
  --confirm-production-project-ref <ref> \
  --execute
```

- refuses staging ref
- refuses non-empty destination (**never auto-TRUNCATE**)
- dependency-ordered inserts, FKs enabled, transactional all-or-nothing

---

## Production Auth

Reuses Stage 4F-Auth library (`classify` / `migrateOneUser` / ports).

```bash
# default dry-run — live classification, exception list, no writes
npx tsx scripts/production/auth-migrate.ts --env-file <prod-supabase-env>

# pilot
npx tsx scripts/production/auth-migrate.ts --env-file <env> \
  --execute --confirm-production-project-ref <ref> --limit 1

# full bulk (Stage 4H only, after human approval)
npx tsx scripts/production/auth-migrate.ts --env-file <env> \
  --execute --confirm-production-project-ref <ref> --confirm-bulk-migrate
```

Guarantees:

- refuse staging / Neon target
- default dry-run
- never overwrite non-null `supabaseAuthUserId`
- never claim User by email alone
- preserve `User.id`, `isActive`, `passwordHash`
- write rollback inventory outside git
- never log password hashes / service role keys

Rollback (Stage 4H emergency only — **not Stage 4G-B**):

```bash
npx tsx scripts/production/auth-rollback.ts \
  --env-file <env> \
  --rollback-manifest <path> \
  --confirm-production-project-ref <ref> \
  --confirm-rollback \
  --execute
```

Conditional unlink only when `User.supabaseAuthUserId` still equals the migration-created Auth UUID; then delete only that Auth user. Never delete business `User`.

---

## Deterministic validation

```bash
npx tsx scripts/production/validate-neon-supabase.ts \
  --source-env-file <neon-env> \
  --dest-env-file <prod-supabase-env> \
  --confirm-production-project-ref <ref>
```

Read-only. Refuses staging destination and same-DB comparisons.

---

## Write-freeze procedure

There is **no in-app write-freeze flag** in this repository.

Deployment platform is **not** proven from repo config (no `vercel.json` / Railway / Fly / GitHub Actions cron). Exact deploy pause actions are:

`DEPLOY_PLATFORM_ACTION_REQUIRED`

### Freeze checklist (from actual writers)

| Writer group | How it writes | Pause | Verify | Restore | Queued / retry |
|---|---|---|---|---|---|
| Auth / register / session / password | `User`, sessions, optional Supabase Auth | `DEPLOY_PLATFORM_ACTION_REQUIRED` | no new `User` / password changes | re-enable app | login retries are request-scoped |
| Jobs / stages / budgets | `Job*`, budgets; may create `Notification` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | freeze-verify `Job` | re-enable app | client retries possible |
| Stripe webhook | `StripeWebhookEvent` + billing fields on `User`/`Company` | Disable Stripe webhook endpoint **and** pause app | freeze-verify `StripeWebhookEvent` | re-enable webhook after cutover | Stripe retries; idempotency via `StripeWebhookEvent` (`processed` skip; stale `processing` ≥5m reclaim; failed → HTTP 500 retry) |
| Stripe checkout/cancel/resume/portal | Stripe API + some `User` fields | `DEPLOY_PLATFORM_ACTION_REQUIRED` | billing fields stable | re-enable | webhook backlog may apply later |
| Attendance | `AttendanceSession` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | freeze-verify | re-enable | state machine rejects invalid transitions |
| Vacations | `VacationRequest`, `Notification` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | freeze-verify | re-enable | `ALREADY_DECIDED` → 409 |
| Members / company create / rename / API key | `Company`, `CompanyMember` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | freeze-verify `Company` | re-enable | seat sync may hit Stripe |
| Deactivation / recovery | `User`/`Company`/`VerificationToken`/`AuditLog` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | freeze-verify | re-enable | Stripe cancel may warn |
| Push subscribe/unsubscribe | `PushSubscription` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | no subscription churn | re-enable | client re-subscribe |
| Google OAuth callback | Google token columns on `User` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | no token updates | re-enable | OAuth code one-shot |
| Cron worker orphan cleanup `POST /api/cron/worker-orphan-cleanup` | soft-tombstone orphan workers | Disable external scheduler (`DEPLOY_PLATFORM_ACTION_REQUIRED`; schedule **not in repo**) | no new tombstones | re-enable scheduler | batch 100; idempotent for already-tombstoned |
| Public intake | `AuditLog` | `DEPLOY_PLATFORM_ACTION_REQUIRED` or invalidate API keys | freeze-verify `AuditLog` | re-enable | clients may duplicate |
| Notifications mark-read / me profile | `Notification` / `User` | `DEPLOY_PLATFORM_ACTION_REQUIRED` | freeze-verify | re-enable | mostly idempotent |

### Freeze verification

```bash
npx tsx scripts/production/freeze-verify.ts --env-file <prod-neon-env> --interval-seconds <N>
```

Operator chooses `N`. If writes continue:

`FREEZE_NOT_CONFIRMED` → Stage 4H must abort.

No probe rows are created.

---

## Backup procedure

Production exports/backups may contain password hashes, OAuth tokens, verification tokens, push endpoints, billing identifiers.

1. Default destination: `VECTORWORK_MIGRATION_ARTIFACT_DIR` or `../vectorwork-migration-artifacts` (**outside git**).
2. Keep `manifest.json` with counts + hashes.
3. Verify archive integrity (hash file / zip test) before cutover.
4. Keep a **secondary protected copy** offline/offline-disk (operator-managed).
5. Do **not** commit production backups.
6. Do **not** auto-upload anywhere.

Historical staging evidence only (not production data):

`backups/stage4c-neon-2026-07-30T18-24-58-450Z/`

---

## Pooler / transaction safety

- Staging observed Session pool capacity ~15 concurrent sessions.
- **Do not assume production capacity equals staging.**
- Operator/migration scripts default to `connection_limit=1`.
- Re-probe production connectivity/capacity during Stage 4H (not stress-tested in 4G-B).
- Job advisory locks require Session-mode-compatible connections; signed int64 advisory lock fix in `lib/server/jobs/job-advisory-lock-key.ts` must remain.

---

## Manual Auth exceptions

Production dry-run writes `exceptions.json` with live categories E/F/H/I.

Allowed dispositions:

- leave unlinked
- correct email before migration after human verification
- disable/defer account

Never fabricate emails. Never silently delete users.

---

## Stage 4H GO/NO-GO

```bash
npx tsx scripts/production/stage4h-preflight.ts \
  --neon-env-file <neon> \
  --supabase-env-file <prod-supabase> \
  --confirm-production-project-ref <ref> \
  --copy-dry-run-ok --tsc-ok --build-ok --tests-ok --prisma-ok
```

Outputs exactly one of:

- `STAGE_4H_PREFLIGHT_READY`
- `STAGE_4H_PREFLIGHT_BLOCKED` (+ `failed_gates`)

Does not perform cutover.

---

## Identity architecture (immutable)

```text
auth.users.id → User.supabaseAuthUserId → User.id
```

`User.id` remains the business identity for all relations.
