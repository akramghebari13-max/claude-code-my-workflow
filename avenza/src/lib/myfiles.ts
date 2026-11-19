/** Personal finance helpers. No business-ledger or runtime dependencies. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent and housing",
  "Food and groceries",
  "Transport",
  "Shopping",
  "Electricity and gas",
  "Water bills",
  "Internet and phone",
  "Entertainment",
  "Insurance",
  "Other expenses",
] as const;

export const DOC_TYPES: readonly [string, string][] = [
  ["receipt", "Receipt"],
  ["utility_bill", "Utility bill"],
  ["rent_receipt", "Rent receipt"],
  ["payslip", "Payslip"],
  ["bank_statement", "Bank statement"],
  ["invoice", "Invoice"],
  ["other", "Other"],
];
export const ACCEPTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;
export const MAX_UPLOAD_BYTES = 10485760;

export const MAX_AMOUNT_PENCE = 100000000000;

/** Parse decimal pounds using integer arithmetic, never floating-point multiplication. */
export function parseMoneyToPence(input: string): number {
  const value = input.trim().replace(/^£\s*/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("Amount must be positive pounds with at most two decimal places");
  }
  const [whole = "", fraction = ""] = value.replaceAll(",", "").split(".");
  const pence = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (pence <= 0n || pence > BigInt(MAX_AMOUNT_PENCE)) {
    throw new Error("Amount must be between £0.01 and £1,000,000,000.00");
  }
  return Number(pence);
}

export function formatPence(value: number | bigint): string {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error("Amount must be whole pence");
  }
  const pence = BigInt(value);
  const absolute = pence < 0n ? -pence : pence;
  return `${pence < 0n ? "-" : ""}£${(absolute / 100n).toLocaleString("en-GB")}.${String(absolute % 100n).padStart(2, "0")}`;
}

function parseISO(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("Choose a valid date");
  }
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error("Choose a valid date");
  }
  return date;
}

export function monthStartISO(iso: string): string {
  const date = parseISO(iso);
  date.setUTCDate(1);
  return date.toISOString().slice(0, 10);
}

/** Calendar-month addition clamps the day to the destination month's end. */
export function addMonthsISO(iso: string, n: number): string {
  const date = parseISO(iso);
  if (!Number.isSafeInteger(n)) throw new Error("Choose a whole number of months");
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + n);
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  date.setUTCDate(Math.min(day, end.getUTCDate()));
  if (!Number.isFinite(date.getTime())) throw new Error("Choose a valid date");
  return date.toISOString().slice(0, 10);
}

/** The sanitized filename is at most 120 characters; folder and UUID are additional. */
export function buildStoragePath(userId: string, fileName: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("Choose a valid user account");
  }
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const safe = base
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^[._-]+/, "");
  const dot = safe.lastIndexOf(".");
  const extension = dot > 0 ? safe.slice(dot).slice(0, 119) : "";
  const stem = (dot > 0 ? safe.slice(0, dot) : safe) || "file";
  const name = stem.slice(0, 120 - extension.length) + extension;
  return `${userId.toLowerCase()}/${crypto.randomUUID()}-${name}`;
}

export function validateUpload(file: {
  name: string;
  type: string;
  size: number;
}): { ok: true } | { ok: false; message: string } {
  const extension = file.name.toLowerCase().split(".").pop();
  const allowed: readonly [string, readonly string[]][] = [
    ["image/jpeg", ["jpg", "jpeg"]],
    ["image/png", ["png"]],
    ["application/pdf", ["pdf"]],
  ];
  if (
    !allowed.some(
      ([mime, extensions]) => mime === file.type && extensions.includes(extension ?? ""),
    )
  ) {
    return { ok: false, message: "Choose a JPEG, PNG or PDF file" };
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return { ok: false, message: "Choose a file that is not empty" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: "Choose a file no larger than 10 MB" };
  }
  return { ok: true };
}
