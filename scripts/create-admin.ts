// Create or update an admin user in production, so you can sign in without
// seeding demo data. Run with the production DATABASE_URL set, for example:
//
//   ADMIN_EMAIL=marlon@storyadvantage.co ADMIN_PASSWORD='a-strong-password' \
//   DATABASE_URL=... DIRECT_DATABASE_URL=... npx tsx scripts/create-admin.ts

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Marlon";
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD.");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", name },
    create: { email, name, role: "ADMIN", department: null, passwordHash, billable: false },
  });
  console.log(`Admin ready: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
