import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a paise amount (bigint) as INR. All money in the DB is stored in
 * paise (₹1 = 100 paise). Use this anywhere a money value is read from the
 * database. Negative values get a "−" prefix.
 */
export function formatPaise(paise: number | bigint | null | undefined): string {
  if (paise == null) return "—";
  const rupees = Number(paise) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

/** Convert rupees (from form input) to paise for DB storage. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Show a friendly countdown to a future date. e.g. "in 3 days" / "today" / "2h left". */
export function timeUntil(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";
  const ms = target - Date.now();
  if (ms < 0) {
    const ago = Math.abs(ms);
    const days = Math.floor(ago / 86400000);
    if (days >= 1) return `${days}d ago`;
    const hours = Math.floor(ago / 3600000);
    if (hours >= 1) return `${hours}h ago`;
    return "just now";
  }
  const days = Math.floor(ms / 86400000);
  if (days >= 7) return `in ${Math.floor(days / 7)}w`;
  if (days >= 1) return `in ${days}d`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `in ${hours}h`;
  const mins = Math.floor(ms / 60000);
  if (mins >= 1) return `in ${mins}m`;
  return "now";
}

export function formatDate(d: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
}

export function timeAgo(d: string | Date): string {
  const date = new Date(d).getTime();
  const seconds = Math.floor((Date.now() - date) / 1000);
  const intervals: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [secs, label] of intervals) {
    const v = Math.floor(seconds / secs);
    if (v >= 1) return `${v}${label} ago`;
  }
  return "just now";
}

/** Create a short hash for cache keys (no crypto, just for deduplication). */
export function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
