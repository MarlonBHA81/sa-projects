// Reading the wall clock is impure, so it must not happen inline in a
// component's render (React's purity rule). These tiny helpers keep the
// `Date.now()` / `new Date()` call out of any render scope: server components
// call them while loading data and pass the result down as a plain value, so a
// re-render never silently produces a different "now".

/** The current epoch milliseconds. Call outside render and pass the value down. */
export function nowMs(): number {
  return Date.now();
}

/** The current instant. Call outside render and pass the value down. */
export function now(): Date {
  return new Date();
}

/** The instant `days` days ago. Used by the "last 7 days" rollups. */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}
