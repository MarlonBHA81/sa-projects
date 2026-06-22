// Shared integration-test helpers: a connectivity probe so the suite skips
// gracefully without a database, deterministic fixtures (departmental users,
// a client, project templates) and a truncation-based cleanup that wipes the
// PM tables between tests. The test database is dedicated, so a full wipe is
// safe and far simpler than per-test transaction rollback across the many
// nested writes the services do.

import { prisma } from "@/lib/db";
import { seedProjectTemplates } from "@/lib/seed-templates";
import type { SessionUser } from "@/lib/auth-helpers";
import type { Department, Role } from "@prisma/client";

/** True if the configured Postgres is reachable. Cached after the first probe. */
let reachable: boolean | undefined;
export async function dbAvailable(): Promise<boolean> {
  if (reachable !== undefined) return reachable;
  try {
    await prisma.$queryRaw`SELECT 1`;
    reachable = true;
  } catch {
    reachable = false;
  }
  return reachable;
}

// Tables touched by the PM module + templates, in an order safe for TRUNCATE
// CASCADE. We never truncate the auth/user tables we seed ourselves below; we
// recreate users explicitly so each suite controls department membership.
const PM_TABLES = [
  "Timesheet",
  "TaskComment",
  "TaskChecklistItem",
  "TaskFollower",
  "TaskAssignee",
  "DiscussionComment",
  "ProjectDiscussion",
  "ProjectNote",
  "ProjectFile",
  "ProjectActivity",
  "TaskDependency",
  "Task",
  "Milestone",
  "ProjectMember",
  "ProjectSettings",
  "Project",
  "TemplateChecklistItem",
  "TemplateTask",
  "TemplateMilestone",
  "ProjectTemplate",
  "Activity",
  "Client",
  "User",
];

/** Wipe every PM/template/user/activity table. Safe on the dedicated test DB. */
export async function resetDb(): Promise<void> {
  const list = PM_TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export type SeededUser = SessionUser & { id: string };

// One user per department plus the super admin, mirroring prisma/seed.ts. The
// department-assignee resolver in the template service picks the
// earliest-created member of each department, so insertion order is stable.
const USERS: { email: string; name: string; role: Role; department: Department | null }[] = [
  { email: "marlon@storyadvantage.co", name: "Marlon", role: "SUPER_ADMIN", department: null },
  { email: "strategy@storyadvantage.co", name: "Strategy User", role: "STRATEGY", department: "STRATEGY" },
  { email: "copy@storyadvantage.co", name: "Copy User", role: "COPY", department: "COPY" },
  { email: "design@storyadvantage.co", name: "Design User", role: "DESIGN", department: "DESIGN" },
  { email: "dev@storyadvantage.co", name: "Dev User", role: "DEV", department: "DEV" },
  { email: "sales@storyadvantage.co", name: "Sales User", role: "SALES", department: "SALES" },
];

export type Fixtures = {
  admin: SeededUser; // super admin / approver
  byDept: Record<Department, SeededUser>;
  member: SeededUser; // a non-approver department user (DEV)
  clientId: string;
  users: SeededUser[];
};

/** Recreate the deterministic user + client fixtures. Call after resetDb(). */
export async function seedFixtures(): Promise<Fixtures> {
  const users: SeededUser[] = [];
  const byDept = {} as Record<Department, SeededUser>;
  let admin: SeededUser | undefined;
  for (const u of USERS) {
    const created = await prisma.user.create({
      // passwordHash is required; these tests pass a SessionUser directly and
      // never authenticate, so a placeholder is fine.
      data: {
        email: u.email,
        name: u.name,
        role: u.role,
        department: u.department,
        passwordHash: "x",
      },
      select: { id: true, role: true, department: true, name: true, email: true },
    });
    const su: SeededUser = {
      id: created.id,
      role: created.role,
      department: created.department,
      name: created.name,
      email: created.email,
    };
    users.push(su);
    if (su.department) byDept[su.department] = su;
    if (u.role === "SUPER_ADMIN") admin = su;
  }
  const client = await prisma.client.create({
    data: { name: "Test Client", industry: "Testing" },
    select: { id: true },
  });
  if (!admin) throw new Error("fixtures: missing super admin");
  return { admin, byDept, member: byDept.DEV, clientId: client.id, users };
}

/** Seed the three project templates and return their ids by kind. */
export async function seedTemplates(): Promise<Record<string, string>> {
  await seedProjectTemplates(prisma);
  const templates = await prisma.projectTemplate.findMany({ select: { id: true, kind: true } });
  const byKind: Record<string, string> = {};
  for (const t of templates) byKind[t.kind] = t.id;
  return byKind;
}

export { prisma };
