import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const job = await p.job.findFirst({
  where: { deletedAt: null },
  select: { id: true, companyId: true, jobNumber: true },
  orderBy: { createdAt: "desc" },
});
console.log(JSON.stringify(job));
await p.$disconnect();
