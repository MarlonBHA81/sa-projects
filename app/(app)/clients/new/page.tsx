import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/auth-helpers";
import { Card, PageHeader } from "@/components/ui";
import { createClientAction } from "./actions";

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/clients");
  const { error } = await searchParams;
  const field = "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm";

  return (
    <div className="max-w-lg">
      <div className="mb-4 text-sm text-zinc-500">
        <Link href="/clients" className="hover:text-zinc-900">
          Clients
        </Link>
      </div>
      <PageHeader title="New client" subtitle="The brand you are building for." />
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}
      <Card>
        <form action={createClientAction} className="flex flex-col gap-4">
          <label className="text-sm font-medium text-zinc-700">
            Name
            <input name="name" required className={field} />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Industry
            <input name="industry" className={field} />
          </label>
          <label className="text-sm font-medium text-zinc-700">
            Notes
            <textarea name="notes" rows={3} className={field} />
          </label>
          <button className="self-start rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">
            Create client
          </button>
        </form>
      </Card>
    </div>
  );
}
