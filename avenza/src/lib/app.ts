import { useSuspenseQuery } from "@tanstack/react-query";
import { businessQuery } from "./ledger";

/** Today's date in the UK (handles British Summer Time), as YYYY-MM-DD. */
export function todayUK(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}

/** Owners and accountants can post; staff are read-only. */
export function useCanPost(businessId: string) {
  const { data } = useSuspenseQuery(businessQuery(businessId));
  const role = data?.business_members[0]?.role;
  return role === "owner" || role === "accountant";
}

const KNOWN: [RegExp, string][] = [
  [/row-level security|permission denied|Not allowed/i, "You don't have permission to do that for this business."],
  [/JWT|session/i, "Your session has expired. Please sign in again."],
  [/Failed to fetch|NetworkError|network/i, "Couldn't reach the server. Check your connection and try again."],
  [/duplicate key/i, "That already exists."],
];
// Messages our own database rules raise are already written for people — pass them through.
const OURS = /balance|filed VAT|credit note|void|invoice|Amount|account|date|address|VAT|Choose|already|required|reversed|Line|Transaction|refund|registered|zero|negative|Description|lines|Too many/i;

export function friendlyError(err: unknown): string {
  const msg = typeof err === "string" ? err : (err as { message?: string })?.message ?? "";
  for (const [re, text] of KNOWN) if (re.test(msg)) return text;
  if (msg && OURS.test(msg) && msg.length < 200) return msg;
  return "Something went wrong — nothing was saved. Please try again.";
}
