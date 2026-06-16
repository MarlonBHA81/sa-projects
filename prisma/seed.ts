import { PrismaClient, type Department, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createFunnelBuildFromTemplate } from "../lib/seed-funnel";

const prisma = new PrismaClient();

// Shared development password for all seeded accounts.
const DEV_PASSWORD = "password";

type SeedUser = {
  email: string;
  name: string;
  role: Role;
  department: Department | null;
  costRatePerHour: number;
  billRatePerHour: number;
  weeklyCapacityHours: number;
};

const USERS: SeedUser[] = [
  { email: "marlon@storyadvantage.co", name: "Marlon", role: "SUPER_ADMIN", department: null, costRatePerHour: 1200, billRatePerHour: 0, weeklyCapacityHours: 20 },
  { email: "strategy@storyadvantage.co", name: "Purple Ocean Navigator", role: "STRATEGY", department: "STRATEGY", costRatePerHour: 900, billRatePerHour: 2000, weeklyCapacityHours: 30 },
  { email: "copy@storyadvantage.co", name: "Resonance Engine Builder", role: "COPY", department: "COPY", costRatePerHour: 750, billRatePerHour: 1700, weeklyCapacityHours: 30 },
  { email: "design@storyadvantage.co", name: "Visual Authority Architect", role: "DESIGN", department: "DESIGN", costRatePerHour: 700, billRatePerHour: 1600, weeklyCapacityHours: 30 },
  { email: "dev@storyadvantage.co", name: "Conversion Architect", role: "DEV", department: "DEV", costRatePerHour: 800, billRatePerHour: 1800, weeklyCapacityHours: 30 },
  { email: "sales@storyadvantage.co", name: "Authority Revenue Translator", role: "SALES", department: "SALES", costRatePerHour: 850, billRatePerHour: 1900, weeklyCapacityHours: 25 },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

  const byDept = new Map<Department, string>();
  let adminId = "";
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        department: u.department,
        costRatePerHour: u.costRatePerHour,
        billRatePerHour: u.billRatePerHour,
        weeklyCapacityHours: u.weeklyCapacityHours,
        passwordHash,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        department: u.department,
        costRatePerHour: u.costRatePerHour,
        billRatePerHour: u.billRatePerHour,
        weeklyCapacityHours: u.weeklyCapacityHours,
        billable: u.department !== null,
        passwordHash,
      },
    });
    if (u.department === null) adminId = user.id;
    if (u.department) byDept.set(u.department, user.id);
  }

  // Demo client + engagement (idempotent by name).
  let client = await prisma.client.findFirst({ where: { name: "Highveld Wellness" } });
  if (!client) {
    client = await prisma.client.create({
      data: { name: "Highveld Wellness", industry: "Health and wellness" },
    });
  }

  let engagement = await prisma.engagement.findFirst({
    where: { clientId: client.id, name: "Lead magnet funnel" },
  });
  if (!engagement) {
    engagement = await prisma.engagement.create({
      data: {
        clientId: client.id,
        name: "Lead magnet funnel",
        deliveryType: "DFY",
        status: "ACTIVE",
        listPrice: "60000",
        price: "45000",
        currency: "ZAR",
        startDate: new Date(),
      },
    });
  }

  // Full build from the template (only once).
  const existingBuild = await prisma.funnelBuild.findFirst({
    where: { engagementId: engagement.id },
  });
  if (!existingBuild) {
    const buildId = await createFunnelBuildFromTemplate({
      engagementId: engagement.id,
      name: "Lead magnet funnel",
      actorId: adminId,
      conversionGoal: "BOOK_A_CALL",
      audienceSegment: "Reputation-built Johannesburg business owners aged 40 to 60",
    });

    // Assign each deliverable to its department's user for a realistic workload demo.
    const deliverables = await prisma.deliverable.findMany({
      where: { funnelBuildId: buildId },
      select: { id: true, department: true },
    });
    for (const d of deliverables) {
      const assigneeId = byDept.get(d.department);
      if (assigneeId) {
        await prisma.deliverable.update({ where: { id: d.id }, data: { assigneeId } });
      }
    }
    console.log(`Seeded build ${buildId} with ${deliverables.length} deliverables.`);
  } else {
    console.log("Build already seeded, skipping.");
  }

  console.log("Seed complete. Sign in with any seeded email and password:", DEV_PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
