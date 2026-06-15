import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canActOnDepartment } from "@/lib/auth-helpers";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatMinutes, formatDate, formatHours } from "@/lib/format";
import { aiConfigured } from "@/lib/ai/client";
import {
  deliverableStatusClass,
  deliverableStatusLabel,
  departmentLabel,
  aiSeverityClass,
} from "@/lib/labels";
import {
  addCommentAction,
  analyseDeliverableAction,
  addOptionAction,
  approveAction,
  assignAction,
  logTimeAction,
  recordGruntTestAction,
  reopenCopyAction,
  requestChangesAction,
  saveBodyAction,
  selectOptionAction,
  setChecklistAction,
  setDueDateAction,
  setEstimateAction,
  setStepAction,
  startAction,
  startTimerAction,
  stopTimerAction,
  submitAction,
} from "./actions";

const btn = "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors";
const primary = `${btn} bg-zinc-900 text-white hover:bg-zinc-700`;
const secondary = `${btn} border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`;

export default async function DeliverablePage({
  params,
  searchParams,
}: {
  params: Promise<{ buildId: string; deliverableId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { buildId, deliverableId } = await params;
  const { error } = await searchParams;
  const user = await requireUser();

  const d = await prisma.deliverable.findUnique({
    where: { id: deliverableId },
    include: {
      stage: { select: { title: true, order: true } },
      funnelBuild: { select: { id: true, name: true } },
      assignee: { select: { name: true } },
      processSteps: { orderBy: { order: "asc" } },
      checklistItems: {
        orderBy: { order: "asc" },
        include: { gruntTest: true },
      },
      optionSet: { include: { options: { orderBy: { createdAt: "asc" } } } },
      comments: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } }, take: 20 },
      brandPlaybook: { select: { id: true } },
      timeEntries: {
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!d || d.funnelBuildId !== buildId) notFound();

  const isOwner = canActOnDepartment(user, d.department);
  const isAdmin = user.role === "ADMIN";

  const loggedAgg = await prisma.timeEntry.aggregate({
    where: { deliverableId },
    _sum: { durationMinutes: true },
  });
  const loggedMinutes = loggedAgg._sum.durationMinutes ?? 0;
  const running = await prisma.timeEntry.findFirst({
    where: { userId: user.id, isRunning: true },
    select: { id: true, deliverableId: true },
  });
  const deptUsers =
    isOwner || isAdmin
      ? await prisma.user.findMany({
          where: { OR: [{ department: d.department }, { role: "ADMIN" }] },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  const insight = await prisma.aiInsight.findFirst({
    where: { scope: "DELIVERABLE", scopeId: deliverableId },
    orderBy: { createdAt: "desc" },
  });
  const insightFindings = (insight?.detail as { findings?: string[] } | null)?.findings ?? [];
  const insightSuggestions = (insight?.suggestions as { text: string }[] | null) ?? [];
  const hidden = (
    <>
      <input type="hidden" name="buildId" value={buildId} />
      <input type="hidden" name="deliverableId" value={deliverableId} />
    </>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-4 text-sm text-zinc-500">
        <Link href={`/builds/${buildId}`} className="hover:text-zinc-900">
          {d.funnelBuild.name}
        </Link>
        <span className="mx-1 text-zinc-300">/</span>
        <span>Stage {d.stage.order} · {d.stage.title}</span>
      </div>

      <PageHeader title={d.title} subtitle={d.description ?? undefined}>
        <Badge className={deliverableStatusClass[d.status]}>{deliverableStatusLabel[d.status]}</Badge>
      </PageHeader>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
        <span>{departmentLabel[d.department]}</span>
        <span>· est {formatMinutes(d.estimateMinutes)}</span>
        <span>· due {formatDate(d.dueDate)}</span>
        {d.assignee?.name ? <span>· {d.assignee.name}</span> : null}
      </div>

      {/* Action bar */}
      <div className="mb-6 flex flex-wrap gap-2">
        {isOwner && (d.status === "NOT_STARTED" || d.status === "CHANGES_NEEDED" || d.status === "PAUSED") ? (
          <form action={startAction}>
            {hidden}
            <button className={primary}>{d.status === "NOT_STARTED" ? "Start work" : "Resume"}</button>
          </form>
        ) : null}
        {isOwner && d.status === "IN_PROGRESS" ? (
          <form action={submitAction}>
            {hidden}
            <button className={primary}>Submit for approval</button>
          </form>
        ) : null}
        {isAdmin && d.status === "SUBMITTED" ? (
          <>
            <form action={approveAction}>
              {hidden}
              <button className={primary}>Approve</button>
            </form>
            <form action={requestChangesAction} className="flex items-center gap-2">
              {hidden}
              <input
                name="note"
                placeholder="What needs changing?"
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
              />
              <button className={secondary}>Request changes</button>
            </form>
          </>
        ) : null}
        {isAdmin && d.isCopy && d.status === "APPROVED" ? (
          <form action={reopenCopyAction}>
            {hidden}
            <button className={secondary}>Reopen copy (resync)</button>
          </form>
        ) : null}
      </div>

      {/* Playbook link or body editor */}
      {d.kind === "PLAYBOOK" ? (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-600">This is the Brand Messaging Playbook.</span>
            <Link href={`/builds/${buildId}/playbook`} className={secondary}>
              Open the playbook editor
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-zinc-700">Content</h3>
          <form action={saveBodyAction} className="flex flex-col gap-2">
            {hidden}
            <textarea
              name="body"
              rows={5}
              defaultValue={(d.body as { text?: string } | null)?.text ?? ""}
              disabled={!isOwner}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50"
              placeholder="Write the content here…"
            />
            {isOwner ? <button className={`${secondary} self-start`}>Save content</button> : null}
          </form>
        </Card>
      )}

      {/* AI review (advisory) */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-700">AI review</h3>
          {aiConfigured() ? (
            <form action={analyseDeliverableAction}>
              {hidden}
              <button className="text-xs text-zinc-600 hover:text-zinc-900">Run AI review</button>
            </form>
          ) : null}
        </div>
        {!aiConfigured() ? (
          <p className="mt-2 text-sm text-zinc-500">
            Add ANTHROPIC_API_KEY to enable advisory AI review.
          </p>
        ) : insight ? (
          <div className="mt-2">
            <div className="flex items-center gap-2">
              <Badge className={aiSeverityClass[insight.severity]}>{insight.severity}</Badge>
              <span className="text-sm font-medium text-zinc-900">{insight.title}</span>
            </div>
            <p className="mt-1 text-sm text-zinc-600">{insight.summary}</p>
            {insightFindings.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-zinc-600">
                {insightFindings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : null}
            {insightSuggestions.length ? (
              <div className="mt-2 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
                <div className="mb-1 text-xs font-semibold text-zinc-500">Suggested</div>
                <ul className="list-disc pl-5">
                  {insightSuggestions.map((s, i) => (
                    <li key={i}>{s.text}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-2 text-xs text-zinc-400">Advisory only. It does not change the gate.</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No AI review yet. It runs on submit, or run it now.</p>
        )}
      </Card>

      {/* Process */}
      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Process</h3>
        {d.processSteps.length === 0 ? (
          <p className="text-sm text-zinc-500">No process steps.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {d.processSteps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <div>
                  <span className={s.status === "DONE" ? "text-sm text-zinc-400 line-through" : "text-sm text-zinc-800"}>
                    {s.title}
                  </span>
                  <span className="ml-2 text-xs text-zinc-400">{formatMinutes(s.estimateMinutes)}</span>
                </div>
                {isOwner ? (
                  <form action={setStepAction}>
                    {hidden}
                    <input type="hidden" name="stepId" value={s.id} />
                    <input type="hidden" name="done" value={s.status === "DONE" ? "false" : "true"} />
                    <button className="text-xs text-zinc-500 hover:text-zinc-900">
                      {s.status === "DONE" ? "Undo" : "Mark done"}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Verification checklist */}
      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Verification checklist</h3>
        <ul className="flex flex-col gap-3">
          {d.checklistItems.map((c) => (
            <li key={c.id} className="rounded-lg border border-zinc-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span className={c.checked ? "text-green-600" : "text-zinc-300"}>{c.checked ? "✓" : "○"}</span>
                  <div>
                    <div className="text-sm text-zinc-800">{c.label}</div>
                    {!c.required ? <span className="text-xs text-zinc-400">optional</span> : null}
                    {c.kind === "GRUNT_TEST" && c.gruntTest ? (
                      <span className="ml-1 text-xs text-zinc-500">· last result {c.gruntTest.result}</span>
                    ) : null}
                  </div>
                </div>
                {isOwner && c.kind !== "GRUNT_TEST" ? (
                  <form action={setChecklistAction}>
                    {hidden}
                    <input type="hidden" name="itemId" value={c.id} />
                    <input type="hidden" name="checked" value={c.checked ? "false" : "true"} />
                    <button className="text-xs text-zinc-500 hover:text-zinc-900">
                      {c.checked ? "Uncheck" : "Check"}
                    </button>
                  </form>
                ) : null}
              </div>
              {c.kind === "GRUNT_TEST" && isOwner ? (
                <form action={recordGruntTestAction} className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3">
                  {hidden}
                  <input type="hidden" name="checklistItemId" value={c.id} />
                  <input
                    name="testedText"
                    defaultValue={c.gruntTest?.testedText ?? ""}
                    placeholder="The exact headline or offer being tested"
                    className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                  />
                  <div className="flex flex-col gap-1 text-sm text-zinc-700">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="passWhatOffered" defaultChecked={c.gruntTest?.passWhatOffered} />
                      A stranger gets what is offered
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="passHowItHelps" defaultChecked={c.gruntTest?.passHowItHelps} />
                      ...how it helps
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="passWhatToDo" defaultChecked={c.gruntTest?.passWhatToDo} />
                      ...what to do next
                    </label>
                  </div>
                  <button className={`${secondary} self-start`}>Record grunt test</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {/* Options */}
      {d.optionSet ? (
        <Card className="mb-6">
          <h3 className="mb-1 text-sm font-semibold text-zinc-700">{d.optionSet.prompt}</h3>
          <p className="mb-3 text-xs text-zinc-500">
            Present {d.optionSet.minOptions} to {d.optionSet.maxOptions} options. The approver selects one.
          </p>
          <div className="flex flex-col gap-2">
            {d.optionSet.options.map((o) => {
              const selected = d.optionSet!.selectedOptionId === o.id;
              return (
                <div
                  key={o.id}
                  className={`rounded-lg border p-3 ${selected ? "border-green-300 bg-green-50" : "border-zinc-200"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-900">
                      {o.label} {selected ? <span className="text-xs text-green-700">· selected</span> : null}
                    </span>
                    {isAdmin && !selected ? (
                      <form action={selectOptionAction}>
                        {hidden}
                        <input type="hidden" name="optionId" value={o.id} />
                        <button className="text-xs text-zinc-600 hover:text-zinc-900">Select</button>
                      </form>
                    ) : null}
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {(o.content as { text?: string })?.text ?? ""}
                  </div>
                  {o.rationale ? <div className="mt-1 text-xs text-zinc-400">{o.rationale}</div> : null}
                </div>
              );
            })}
          </div>
          {isOwner ? (
            <form action={addOptionAction} className="mt-3 flex flex-col gap-2 border-t border-zinc-100 pt-3">
              {hidden}
              <input name="label" placeholder="Option label (e.g. Option A)" required className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
              <input name="content" placeholder="The option" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
              <input name="rationale" placeholder="Why this angle (optional)" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
              <button className={`${secondary} self-start`}>Add option</button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {/* Time and planning */}
      <Card className="mb-6">
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Time and planning</h3>
        <div className="flex flex-wrap items-center gap-2">
          {running?.deliverableId === d.id ? (
            <form action={stopTimerAction}>
              {hidden}
              <button className={primary}>Stop timer</button>
            </form>
          ) : isOwner ? (
            <form action={startTimerAction}>
              {hidden}
              <button className={secondary}>Start timer</button>
            </form>
          ) : null}
          {running && running.deliverableId !== d.id ? (
            <span className="text-xs text-amber-700">A timer is running on another task.</span>
          ) : null}
          {isOwner ? (
            <form action={logTimeAction} className="flex items-center gap-2">
              {hidden}
              <input
                name="minutes"
                type="number"
                min="1"
                placeholder="mins"
                className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
              />
              <button className={secondary}>Log time</button>
            </form>
          ) : null}
          <span className="text-sm text-zinc-500">
            Logged {formatHours(loggedMinutes)} · est {formatMinutes(d.estimateMinutes)}
          </span>
        </div>

        {isOwner || isAdmin ? (
          <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-3">
            <form action={setEstimateAction} className="flex items-center gap-1">
              {hidden}
              <label className="text-xs text-zinc-500">Estimate</label>
              <input
                name="minutes"
                type="number"
                min="0"
                defaultValue={d.estimateMinutes ?? ""}
                className="w-20 rounded-lg border border-zinc-300 px-2 py-1 text-sm"
              />
              <button className="text-xs text-zinc-600 hover:text-zinc-900">Save</button>
            </form>
            <form action={setDueDateAction} className="flex items-center gap-1">
              {hidden}
              <label className="text-xs text-zinc-500">Due</label>
              <input
                name="due"
                type="date"
                defaultValue={d.dueDate ? d.dueDate.toISOString().slice(0, 10) : ""}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
              />
              <button className="text-xs text-zinc-600 hover:text-zinc-900">Save</button>
            </form>
            <form action={assignAction} className="flex items-center gap-1">
              {hidden}
              <label className="text-xs text-zinc-500">Assignee</label>
              <select
                name="assigneeId"
                defaultValue={d.assigneeId ?? ""}
                className="rounded-lg border border-zinc-300 px-2 py-1 text-sm"
              >
                <option value="">Unassigned</option>
                {deptUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <button className="text-xs text-zinc-600 hover:text-zinc-900">Save</button>
            </form>
          </div>
        ) : null}

        {d.timeEntries.length ? (
          <ul className="mt-3 flex flex-col gap-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            {d.timeEntries.map((t) => (
              <li key={t.id}>
                {t.user.name}: {t.isRunning ? "running…" : `${t.durationMinutes ?? 0}m`} ·{" "}
                {formatDate(t.createdAt)}
                {t.note ? ` · ${t.note}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {/* Comments / handoff notes */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-zinc-700">Comments and handoff notes</h3>
        <form action={addCommentAction} className="mb-4 flex flex-col gap-2">
          {hidden}
          <textarea name="body" rows={2} placeholder="Add a note…" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" name="isHandoff" /> Mark as a handoff note
          </label>
          <button className={`${secondary} self-start`}>Post</button>
        </form>
        {d.comments.length === 0 ? (
          <p className="text-sm text-zinc-500">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {d.comments.map((c) => (
              <li key={c.id} className="text-sm">
                <span className="font-medium text-zinc-800">{c.author.name}</span>
                {c.isHandoff ? <Badge className="ml-2 bg-amber-100 text-amber-800">handoff</Badge> : null}
                <span className="ml-2 text-xs text-zinc-400">{formatDate(c.createdAt)}</span>
                <p className="mt-0.5 text-zinc-600">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
