import { auth } from "@/auth";
import type { Role, Department } from "@prisma/client";

export type SessionUser = {
  id: string;
  role: Role;
  department: Department | null;
  name?: string | null;
  email?: string | null;
};

/** Thrown when an action is called without the required authentication or role. */
export class AuthError extends Error {
  constructor(message = "Not authorised") {
    super(message);
    this.name = "AuthError";
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  return (session?.user as SessionUser | undefined) ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("You must be signed in");
  return user;
}

/** The approver powers (clear gates, select options) belong to ADMIN and SUPER_ADMIN. */
export function isApprover(role: Role): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function isAdmin(user: Pick<SessionUser, "role">): boolean {
  return isApprover(user.role);
}

export function isSuperAdmin(user: Pick<SessionUser, "role">): boolean {
  return user.role === "SUPER_ADMIN";
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isAdmin(user)) throw new AuthError("This action is for the approver only");
  return user;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isSuperAdmin(user)) throw new AuthError("This action is for the super admin only");
  return user;
}

export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthError("You do not have access to this action");
  return user;
}

/** Department users may act on their own department's work; an admin may act on anything. */
export function canActOnDepartment(
  user: Pick<SessionUser, "role" | "department">,
  department: Department,
): boolean {
  return isAdmin(user) || user.department === department;
}

export async function requireDepartmentOwnership(department: Department): Promise<SessionUser> {
  const user = await requireUser();
  if (!canActOnDepartment(user, department)) {
    throw new AuthError("This work belongs to another department");
  }
  return user;
}
