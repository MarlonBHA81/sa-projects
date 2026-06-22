import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth-helpers";
import { departmentLabel } from "@/lib/labels";
import { signOutAction } from "./actions";

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
    >
      {children}
    </Link>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const isSuper = user.role === "SUPER_ADMIN";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl bg-zinc-50">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-4 sm:block">
        <div className="mb-6 px-3">
          <div className="text-sm font-semibold text-zinc-900">Story Advantage</div>
          <div className="text-xs text-zinc-500">Funnel builds</div>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/projects">Projects</NavLink>
          {isAdmin ? <NavLink href="/templates">Templates</NavLink> : null}
          <NavLink href="/engagements">Engagements</NavLink>
          <NavLink href="/workload">Workload</NavLink>
          <NavLink href="/activity">Activity</NavLink>
          <NavLink href="/insights">Insights</NavLink>
          {isAdmin ? <NavLink href="/approvals">Approvals</NavLink> : null}
          {isSuper ? <NavLink href="/admin">Admin</NavLink> : null}
          {isSuper ? <NavLink href="/trash">Trash</NavLink> : null}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
          <div className="text-sm text-zinc-500">
            {user.name}
            <span className="mx-1 text-zinc-300">·</span>
            {user.department ? departmentLabel[user.department] : "Approver"}
          </div>
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-zinc-600 hover:text-zinc-900">
              Sign out
            </button>
          </form>
        </header>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
