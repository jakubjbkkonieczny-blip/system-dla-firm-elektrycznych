import "dotenv/config";
import { config } from "dotenv";
import { prisma } from "./lib/db/prisma";

config({ path: ".env.local" });

async function main() {
  const user = await prisma.user.create({
    data: {
      email: "test@example.com",
      displayName: "Test User",
    },
  });

  console.log("CREATED:", user);

  const users = await prisma.user.findMany();
  console.log("ALL USERS:", users);
}

main()
  .catch((err) => {
    console.error("ERROR:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });