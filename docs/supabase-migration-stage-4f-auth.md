# Stage 4F-Auth — VectorWork → Supabase Auth identity migration

**Status:** Tooling + dry-run only. Bulk migration requires human review.  
**Architecture:** `auth.users.id → User.supabaseAuthUserId → User.id` (User.id immutable)

## Tool

```bash
npx tsx scripts/staging/_stage4f-auth-migrate.ts           # dry-run (default)
npx tsx scripts/staging/_stage4f-auth-migrate.ts --dry-run
npx tsx scripts/staging/_stage4f-auth-migrate.ts --execute --user-id <id>
npx tsx scripts/staging/_stage4f-auth-migrate.ts --execute --limit 10
# Full bulk (forbidden until review):
# npx tsx scripts/staging/_stage4f-auth-migrate.ts --execute --confirm-bulk-migrate
```

## Supported Auth Admin import

Official `@supabase/auth-js` `AdminUserAttributes` supports:

- `password_hash` (bcrypt / scrypt / argon2)
- `email_confirm`
- `ban_duration`
- create without password (`email` + `email_confirm` only)

VectorWork strategy: `bcrypt_import_with_reset_fallback` (`lib/supabase/phase0-dependencies.ts`).

## Reports (no secrets)

- `scripts/staging/_stage4f-auth-classify.json`
- `scripts/staging/_stage4f-auth-migrate-dry-run.json`
- `scripts/staging/_stage4f-auth-plan.json`
