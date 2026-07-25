const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole days between `iso` and today, in local time. 0 = today, 1 = yesterday. */
function daysAgo(iso: string): number {
  const then = startOfDay(new Date(iso));
  const today = startOfDay(new Date());
  return Math.round((today - then) / 86_400_000);
}

/** 24-hour clock, e.g. "12:04". */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** With seconds, for the settlement timeline: "12:04:04". */
export function timeWithSeconds(iso: string): string {
  return `${timeLabel(iso)}:${String(new Date(iso).getSeconds()).padStart(2, "0")}`;
}

/** "22 Mar, 12:04:04" — the transaction detail timeline. */
export function dateTimeLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${timeWithSeconds(iso)}`;
}

/**
 * Compact recency for list rows: the clock for today, "Yesterday", then a date.
 * Keeps the newest rows scannable without repeating today's date on every line.
 */
export function recencyLabel(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return timeLabel(iso);
  if (days === 1) return "Yesterday";
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
}

/** Section heading for a date-grouped feed. */
export function dayGroupLabel(iso: string): string {
  const days = daysAgo(iso);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  const d = new Date(iso);
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]}${year}`;
}

/** Whole seconds until `iso`, floored at zero. Drives the quote-lock countdown. */
export function secondsUntil(iso: string): number {
  return Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
}

/** "0:54" — the FX quote lock timer. */
export function countdownLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, "0")}`;
}
