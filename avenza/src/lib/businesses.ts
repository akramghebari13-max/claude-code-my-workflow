import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type BusinessType = Database["public"]["Enums"]["business_type"];

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  sole_trader: "Sole trader",
  limited_company: "Limited company",
};

/** UK Companies House numbers: 8 characters, digits or a 2-letter prefix + 6 digits. */
export function isValidCompanyNumber(v: string) {
  return /^([0-9]{8}|[A-Z]{2}[0-9]{6})$/.test(v.trim().toUpperCase());
}
/** HMRC Unique Taxpayer Reference: 10 digits. */
export function isValidUtr(v: string) {
  return /^[0-9]{10}$/.test(v.replace(/\s/g, ""));
}
/**
 * UK VAT number: optional GB/XI prefix, 9 digits (or 12 for branch traders),
 * with HMRC's modulus 97 / 9755 check digits on the first 9.
 */
export function isValidVatNumber(v: string) {
  const s = v.replace(/\s/g, "").toUpperCase().replace(/^(GB|XI)/, "");
  if (/^(GD|HA)[0-9]{3}$/.test(s)) return true;
  if (!/^([0-9]{9}|[0-9]{12})$/.test(s)) return false;
  const d = s.slice(0, 9).split("").map(Number);
  const sum = d.slice(0, 7).reduce((t, n, i) => t + n * (8 - i), 0);
  const check = d[7]! * 10 + d[8]!;
  return (sum + check) % 97 === 0 || (sum + 55 + check) % 97 === 0;
}

export type Jurisdiction = Database["public"]["Enums"]["uk_jurisdiction"];
export const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  england_wales: "England and Wales", scotland: "Scotland", northern_ireland: "Northern Ireland",
};

export const myBusinessesQuery = queryOptions({
  queryKey: ["businesses"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, business_type, company_number, vat_registered, vat_number, year_end_month, year_end_day, business_members(role)")
      .order("created_at");
    if (error) throw error;
    return data;
  },
});
