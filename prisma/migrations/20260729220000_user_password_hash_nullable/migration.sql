-- Stage 2A: allow Supabase-Auth-managed users without a VectorWork password hash.
-- Legacy users retain passwordHash. Neon remains the business database.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
