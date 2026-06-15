// Pure time/workload helpers. No I/O imports, so they stay unit-testable.

export function minutesBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000));
}

const ACTIVE_STATUSES = new Set(["NOT_STARTED", "IN_PROGRESS", "CHANGES_NEEDED", "SUBMITTED"]);

export type WorkloadPerson = {
  userId: string;
  name: string;
  weeklyCapacityMinutes: number;
  committedMinutes: number; // remaining estimate on active assigned work
  loggedMinutes: number; // time logged this period
};

export type WorkloadInputUser = {
  id: string;
  name: string;
  weeklyCapacityHours: number | null;
};
export type WorkloadInputDeliverable = {
  assigneeId: string | null;
  status: string;
  estimateMinutes: number | null;
};
export type WorkloadInputEntry = { userId: string; durationMinutes: number | null };

export function summariseWorkload(
  users: WorkloadInputUser[],
  deliverables: WorkloadInputDeliverable[],
  entries: WorkloadInputEntry[],
): WorkloadPerson[] {
  return users.map((u) => {
    const committedMinutes = deliverables
      .filter((d) => d.assigneeId === u.id && ACTIVE_STATUSES.has(d.status))
      .reduce((acc, d) => acc + (d.estimateMinutes ?? 0), 0);
    const loggedMinutes = entries
      .filter((e) => e.userId === u.id)
      .reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
    return {
      userId: u.id,
      name: u.name,
      weeklyCapacityMinutes: (u.weeklyCapacityHours ?? 0) * 60,
      committedMinutes,
      loggedMinutes,
    };
  });
}

export function utilisationPct(
  person: Pick<WorkloadPerson, "committedMinutes" | "weeklyCapacityMinutes">,
): number {
  if (person.weeklyCapacityMinutes <= 0) return 0;
  return Math.round((person.committedMinutes / person.weeklyCapacityMinutes) * 100);
}
