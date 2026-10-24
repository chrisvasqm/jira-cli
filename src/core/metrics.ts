const DAY_MS = 86_400_000;

/** Days from `from` to `to` (ISO strings), one decimal. */
export function daysBetween(from: string, to: string): number {
  return round1((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Value at percentile `pct` (0-100) with linear interpolation; null for no values. */
export function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const rank = (pct / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return round1(sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low));
}

/** Monday of the ISO week containing `iso`, as YYYY-MM-DD (UTC). */
export function weekOf(iso: string): string {
  const date = new Date(iso);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - sinceMonday);
  return date.toISOString().slice(0, 10);
}

/** Sum of numeric values; null when none of them is a number. */
export function sumNumbers(values: unknown[]): number | null {
  const numbers = values.filter((value): value is number => typeof value === "number");
  return numbers.length === 0 ? null : round1(numbers.reduce((sum, value) => sum + value, 0));
}
