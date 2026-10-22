import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@vaultrecover.test";
  const passwordHash = await bcrypt.hash("DemoPassword123!", 12);

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, name: "Demo User" },
  });

  console.log(`Seeded demo user: ${email} / DemoPassword123!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
