import type { Prisma } from "@prisma/client";

type Decimalish = Prisma.Decimal | number | string | null | undefined;

export function toNumber(value: Decimalish): number {
  if (value == null) return 0;
  return typeof value === "number" ? value : Number(value);
}

export function formatMoney(value: Decimalish, currency = "ZAR"): string {
  if (value == null) return "n/a";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

export function formatMinutes(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "n/a";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatHours(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "0h";
  return `${(minutes / 60).toFixed(1)}h`;
}

export function formatDate(date?: Date | string | null): string {
  if (!date) return "n/a";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
