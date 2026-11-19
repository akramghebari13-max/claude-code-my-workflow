export const VAT_BOXES = [
  { key: "box1", n: "1", label: "VAT due on sales" },
  { key: "box2", n: "2", label: "VAT due on EU acquisitions (NI only)" },
  { key: "box3", n: "3", label: "Total VAT due" },
  { key: "box4", n: "4", label: "VAT reclaimed on purchases" },
  { key: "box5", n: "5", label: "Net VAT to pay (or reclaim)" },
  { key: "box6", n: "6", label: "Total sales excluding VAT" },
  { key: "box7", n: "7", label: "Total purchases excluding VAT" },
  { key: "box8", n: "8", label: "Goods supplied to the EU (NI only)" },
  { key: "box9", n: "9", label: "Goods acquired from the EU (NI only)" },
] as const;

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Calendar quarter containing the date, e.g. 1 Jan – 31 Mar. */
export function quarterBounds(d: Date) {
  const q = Math.floor(d.getMonth() / 3);
  return { start: iso(new Date(d.getFullYear(), q * 3, 1)), end: iso(new Date(d.getFullYear(), q * 3 + 3, 0)) };
}
