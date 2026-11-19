/** Pure helpers for AI category suggestions on bank lines. */
export type CatOption = { id: string; code: string; name: string };

/** Accept the model's answer only if it names one of the allowed account codes. */
export function pickCategory(answer: string, options: CatOption[]): CatOption | null {
  const m = /\b(\d{3,5})\b/.exec(answer ?? "");
  if (!m) return null;
  return options.find((o) => o.code === m[1]) ?? null;
}

/** Same counterparty / wording seen before → reuse that category without asking AI. */
export function historyMatch(description: string, past: { text: string; categoryId: string }[]): string | null {
  const key = normalise(description);
  if (key.length < 3) return null;
  const counts = new Map<string, number>();
  for (const p of past) {
    const t = normalise(p.text);
    if (t && (t.includes(key) || key.includes(t))) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
  }
  let best: string | null = null, n = 0;
  for (const [id, c] of counts) if (c > n) { best = id; n = c; }
  return best;
}

export function normalise(s: string): string {
  return (s ?? "").toLowerCase().replace(/[0-9*#/\\.-]+/g, " ").replace(/\b(card|payment|ref|dd|so|fp|pos|gbp)\b/g, " ").replace(/\s+/g, " ").trim();
}
