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

  await seedDemoProject(client.id, adminId, byDept);

  console.log("Seed complete. Sign in with any seeded email and password:", DEV_PASSWORD);
}

// A Perfex-style demo project on the existing client: members, milestones,
// tasks with assignees, checklist items, and a couple of timesheets. Idempotent
// (guarded by project name).
async function seedDemoProject(
  clientId: string,
  adminId: string,
  byDept: Map<Department, string>,
) {
  const existing = await prisma.project.findFirst({
    where: { name: "Website refresh", clientId },
  });
  if (existing) {
    console.log("Demo project already seeded, skipping.");
    return;
  }

  const copyId = byDept.get("COPY");
  const designId = byDept.get("DESIGN");
  const devId = byDept.get("DEV");
  const now = new Date();
  const inDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000);

  const project = await prisma.project.create({
    data: {
      name: "Website refresh",
      description: "A Perfex-style demo project: rebuild the marketing site.",
      ownerId: adminId,
      clientId,
      status: "IN_PROGRESS",
      billingType: "TASK_HOURS",
      progressFromTasks: true,
      estimatedHours: "80",
      ratePerHour: "1500",
      startDate: now,
      deadline: inDays(30),
      currency: "ZAR",
      settings: {
        create: {
          viewTasks: true,
          viewMilestones: true,
          viewGantt: true,
          viewTeamMembers: true,
          viewActivityLog: true,
        },
      },
      members: {
        create: [adminId, copyId, designId, devId]
          .filter((id): id is string => Boolean(id))
          .map((userId) => ({ userId })),
      },
    },
  });

  // Milestones (ordered).
  const discovery = await prisma.milestone.create({
    data: { projectId: project.id, name: "Discovery", color: "#03a9f4", order: 0, dueDate: inDays(7) },
  });
  const design = await prisma.milestone.create({
    data: { projectId: project.id, name: "Design", color: "#ff6f00", order: 1, dueDate: inDays(18) },
  });
  const build = await prisma.milestone.create({
    data: { projectId: project.id, name: "Build", color: "#fc2d42", order: 2, dueDate: inDays(30) },
  });

  // Tasks with assignees, rates, checklist, and the 5-status set.
  const t1 = await prisma.task.create({
    data: {
      title: "Stakeholder interviews",
      projectId: project.id,
      milestoneId: discovery.id,
      status: "COMPLETE",
      priority: "MEDIUM",
      billable: true,
      hourlyRate: "1500",
      startDate: now,
      dueDate: inDays(5),
      dateFinished: now,
      estimateMinutes: 240,
      assigneeId: copyId ?? null,
      kanbanOrder: 0,
      milestoneOrder: 0,
      assignees: copyId ? { create: [{ userId: copyId }] } : undefined,
      checklistItems: {
        create: [
          { description: "Draft question set", order: 0, finished: true, finishedAt: now, finishedById: copyId ?? null },
          { description: "Book 3 interviews", order: 1, finished: true, finishedAt: now, finishedById: copyId ?? null },
          { description: "Summarise findings", order: 2 },
        ],
      },
    },
  });

  const t2 = await prisma.task.create({
    data: {
      title: "Wireframes",
      projectId: project.id,
      milestoneId: design.id,
      status: "IN_PROGRESS",
      priority: "HIGH",
      billable: true,
      hourlyRate: "1600",
      startDate: inDays(6),
      dueDate: inDays(14),
      estimateMinutes: 600,
      assigneeId: designId ?? null,
      kanbanOrder: 0,
      milestoneOrder: 0,
      assignees: designId ? { create: [{ userId: designId }] } : undefined,
      checklistItems: {
        create: [
          { description: "Home page", order: 0, finished: true, finishedAt: now, finishedById: designId ?? null },
          { description: "Services page", order: 1 },
          { description: "Contact page", order: 2 },
        ],
      },
    },
  });

  const t3 = await prisma.task.create({
    data: {
      title: "Build home page",
      projectId: project.id,
      milestoneId: build.id,
      status: "NOT_STARTED",
      priority: "HIGH",
      billable: true,
      hourlyRate: "1800",
      startDate: inDays(15),
      dueDate: inDays(28),
      estimateMinutes: 900,
      assigneeId: devId ?? null,
      kanbanOrder: 0,
      milestoneOrder: 0,
      assignees: devId ? { create: [{ userId: devId }] } : undefined,
    },
  });

  await prisma.task.create({
    data: {
      title: "SEO review",
      projectId: project.id,
      milestoneId: build.id,
      status: "AWAITING_FEEDBACK",
      priority: "LOW",
      billable: false,
      startDate: inDays(20),
      dueDate: inDays(29),
      estimateMinutes: 120,
      assigneeId: copyId ?? null,
      kanbanOrder: 0,
      milestoneOrder: 1,
      assignees: copyId ? { create: [{ userId: copyId }] } : undefined,
    },
  });

  // A couple of timesheets (closed spans) so the finance overview has data.
  if (copyId) {
    await prisma.timesheet.create({
      data: {
        taskId: t1.id,
        staffId: copyId,
        startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 2h
        hourlyRate: "1500",
        note: "Interviews and notes",
      },
    });
  }
  if (designId) {
    await prisma.timesheet.create({
      data: {
        taskId: t2.id,
        staffId: designId,
        startTime: new Date(now.getTime() - 90 * 60 * 1000),
        endTime: now, // 1.5h
        hourlyRate: "1600",
        note: "Home page wireframe",
      },
    });
  }

  // A note and the project activity for the created project.
  await prisma.projectNote.create({
    data: { projectId: project.id, content: "Kickoff scheduled. Copy locks before design.", authorId: adminId },
  });
  await prisma.projectActivity.create({
    data: { projectId: project.id, actorId: adminId, summary: "Created project Website refresh" },
  });

  // Recompute progress from task completion (1 of 4 complete = 25%).
  const all = await prisma.task.findMany({
    where: { projectId: project.id, deletedAt: null },
    select: { status: true },
  });
  const completed = all.filter((t) => t.status === "COMPLETE").length;
  const progress = all.length ? Math.round((completed / all.length) * 100) : 0;
  await prisma.project.update({ where: { id: project.id }, data: { progress } });

  void t3;
  console.log(`Seeded demo project ${project.id} with ${all.length} tasks, 3 milestones.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
