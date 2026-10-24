import { CliError } from "./errors.js";

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Accepts "abc-12" or "ABC-12" and returns "ABC-12". */
export function issueKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!ISSUE_KEY.test(key)) throw new CliError("USAGE", `"${raw}" is not an issue key like ABC-123`);
  return key;
}

/** Whole number between min and max (inclusive), written as plain digits. */
export function intInRange(raw: string, flag: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
  const value = /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : Number.NaN;
  if (Number.isSafeInteger(value) && value >= min && value <= max) return value;
  const range = max === Number.MAX_SAFE_INTEGER ? `of at least ${min}` : `from ${min} to ${max}`;
  throw new CliError("USAGE", `${flag} must be a whole number ${range}`);
}

export function boardId(raw: string): number {
  return intInRange(raw, "board id", 1);
}

/** Project keys are upper-case letters and digits, e.g. "KAN"; accepts "kan". */
export function projectKey(raw: string): string {
  const key = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new CliError("USAGE", `"${raw}" is not a project key like ABC`);
  return key;
}

/** Comment ids are numeric; accepts "#10001" as shown in the output. */
export function commentId(raw: string): string {
  const id = raw.trim().replace(/^#/, "");
  if (!/^\d+$/.test(id)) throw new CliError("USAGE", `"${raw}" is not a comment id like 10001`);
  return id;
}

/** Attachment ids are numeric, e.g. "10042". */
export function attachmentId(raw: string): string {
  const id = raw.trim();
  if (!/^\d+$/.test(id)) throw new CliError("USAGE", `"${raw}" is not an attachment id like 10042`);
  return id;
}


/** Worklog ids are numeric; accepts "#10001" as shown in the output. */
export function worklogId(raw: string): string {
  const id = raw.trim().replace(/^#/, "");
  if (!/^\d+$/.test(id)) throw new CliError("USAGE", `"${raw}" is not a worklog id like 10001`);
  return id;
}

const DURATION = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/;

/** "2h30m", "2h 30m", "1d" or "45m" (weeks, days, hours, minutes) in Jira's form, e.g. "2h 30m". */
export function duration(raw: string, what: string): string {
  const parts = DURATION.exec(raw.replace(/\s+/g, "").toLowerCase());
  const amounts = (parts?.slice(1) ?? []).map((value) => Number(value ?? 0));
  if (!parts || amounts.every((amount) => amount === 0)) {
    throw new CliError("USAGE", `${what} must look like 2h30m, 1d or 45m (w, d, h and m)`);
  }
  return amounts
    .map((amount, index) => (amount > 0 ? `${amount}${"wdhm"[index]}` : ""))
    .filter(Boolean)
    .join(" ");
}

/** An issue link id ("10001") or a web link id ("w10000"), as `jira link list` shows them. */
export function linkId(raw: string): { web: boolean; id: string } {
  const match = /^(w?)(\d+)$/i.exec(raw.trim());
  if (!match) throw new CliError("USAGE", `"${raw}" is not a link id like 10001 or w10000`);
  return { web: match[1] !== "", id: match[2] ?? "" };
}

/** An http or https URL; anything else is not a web link. */
export function webUrl(raw: string): string | undefined {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return undefined;
  if (!URL.canParse(url)) throw new CliError("USAGE", `"${raw}" is not a valid URL`);
  return url;
}

/** Throws USAGE unless `end` is after `start` (both ISO strings, when given); `what` names the thing. */
export function assertDateOrder(start: string | undefined, end: string | undefined, what: string): void {
  if (start && end && Date.parse(end) <= Date.parse(start)) {
    throw new CliError("USAGE", `The ${what} must end after it starts`);
  }
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** "2026-10-24" (local midnight) or a full ISO timestamp, as an ISO string for Jira. */
export function dateArg(raw: string, flag: string): string {
  const text = raw.trim();
  const parts = ISO_DATE.exec(text);
  const date = new Date(parts?.[4] ? text : `${text}T00:00:00`);
  // Date rolls 2026-02-30 over to March: the calendar day must exist.
  const [year, month, day] = [1, 2, 3].map((index) => Number(parts?.[index]));
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    parts &&
    !Number.isNaN(date.getTime()) &&
    calendar.getUTCDate() === day &&
    calendar.getUTCMonth() === month! - 1
  ) {
    return date.toISOString();
  }
  throw new CliError("USAGE", `${flag} must be a date like 2026-10-24 or an ISO timestamp`);
}
