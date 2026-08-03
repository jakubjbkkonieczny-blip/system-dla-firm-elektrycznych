import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  assertSupabaseStaging,
  loadEnvFile,
  loadStagingEnv,
  withPoolParams,
  ROOT,
} from "./_stage4f-lib.mjs";

const env = {
  ...loadEnvFile(path.join(ROOT, ".env.supabase-staging")),
  ...loadStagingEnv(),
};
assertSupabaseStaging(env);
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: withPoolParams(env.DATABASE_URL, {
        connectionLimit: 1,
        poolTimeout: 30,
      }),
    },
  },
});

try {
  const users = await prisma.user.count();
  const linked = await prisma.user.count({
    where: { supabaseAuthUserId: { not: null } },
  });
  const auth = await prisma.$queryRaw`SELECT count(*)::int AS c FROM auth.users`;
  const companies = await prisma.company.count();
  const jobs = await prisma.job.count();
  console.log(
    JSON.stringify(
      {
        users,
        linked,
        unlinked: users - linked,
        auth_users: auth[0].c,
        companies,
        jobs,
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
