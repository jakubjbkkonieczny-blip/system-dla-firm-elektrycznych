/**
 * Stage 4F — ensure staging .env.local Session pooler URLs carry safe Prisma pool params.
 * Does not touch .env (Neon / production rollback source).
 * Does not print secrets.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  loadEnvFile,
  maskUrl,
  withPoolParams,
  writeJson,
} from "./_stage4f-lib.mjs";

const localPath = path.join(ROOT, ".env.local");
const before = loadEnvFile(localPath);
const dbBefore = before.DATABASE_URL;
const directBefore = before.DIRECT_URL || before.DATABASE_URL;

if (!dbBefore) throw new Error("missing DATABASE_URL in .env.local");
if (/neon\.tech/i.test(new URL(dbBefore).hostname)) {
  throw new Error("Refusing to alter Neon DATABASE_URL");
}
if (!/pooler\.supabase\.com/i.test(new URL(dbBefore).hostname)) {
  throw new Error("Expected Supabase Session pooler in .env.local DATABASE_URL");
}

// Runtime Next.js is a single process — keep headroom under ~15 Session slots.
const CONNECTION_LIMIT = 5;
const POOL_TIMEOUT = 20;

const dbAfter = withPoolParams(dbBefore, {
  connectionLimit: CONNECTION_LIMIT,
  poolTimeout: POOL_TIMEOUT,
});
const directAfter = withPoolParams(directBefore, {
  connectionLimit: CONNECTION_LIMIT,
  poolTimeout: POOL_TIMEOUT,
});

let text = fs.readFileSync(localPath, "utf8");
text = text.replace(
  /^DATABASE_URL=.*$/m,
  `DATABASE_URL=${JSON.stringify(dbAfter)}`
);
text = text.replace(
  /^DIRECT_URL=.*$/m,
  `DIRECT_URL=${JSON.stringify(directAfter)}`
);

if (!text.includes("Stage 4F pool params")) {
  text =
    "# Stage 4F pool params: connection_limit/pool_timeout for Supabase Session pooler.\n" +
    text;
}

fs.writeFileSync(localPath, text);

const after = loadEnvFile(localPath);
const report = {
  stage: "4F",
  mode: "stabilize-env",
  at: new Date().toISOString(),
  changed_file: ".env.local",
  production_env_untouched: true,
  before: {
    DATABASE_URL: maskUrl(dbBefore),
    DIRECT_URL: maskUrl(directBefore),
  },
  after: {
    DATABASE_URL: maskUrl(after.DATABASE_URL),
    DIRECT_URL: maskUrl(after.DIRECT_URL),
  },
  applied: {
    connection_limit: CONNECTION_LIMIT,
    pool_timeout: POOL_TIMEOUT,
    note: "Single Next.js process; leave headroom for migrations/admin/scripts.",
  },
};

writeJson("scripts/staging/_stage4f-stabilize-env.json", report);
console.log(JSON.stringify(report, null, 2));
