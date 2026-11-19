import { createFileRoute } from "@tanstack/react-router";
import { friendlyError, todayUK } from "@/lib/app";
import { queryOptions, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { businessQuery, formatPence } from "@/lib/ledger";
import { VAT_BOXES, quarterBounds } from "@/lib/vat";
import { HmrcPanel, hmrcNotice } from "@/components/hmrc-panel";

const vatSettingsQuery = (id: string) => queryOptions({
  queryKey: ["vat-settings", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("businesses").select("vat_registered, vat_number, vat_scheme, flat_rate_bp").eq("id", id).single();
    if (error) throw error;
    return data;
  },
});
const returnsQuery = (id: string) => queryOptions({
  queryKey: ["vat-returns", id],
  queryFn: async () => {
    const { data, error } = await supabase.from("vat_returns").select("*").eq("business_id", id).order("period_end", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const Route = createFileRoute("/_authenticated/b/$businessId/vat")({
  validateSearch: (search: Record<string, unknown>): { hmrc?: string } =>
    (typeof search["hmrc"] === "string" ? { hmrc: search["hmrc"].slice(0, 32) } : {}),
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(vatSettingsQuery(params.businessId)),
    context.queryClient.ensureQueryData(returnsQuery(params.businessId)),
  ]),
  head: () => ({ meta: [{ title: "VAT returns — AVENZA" }, { name: "description", content: "Preview and file your 9-box VAT return." }] }),
  component: Vat,
});

const SCHEME_LABEL = { standard: "Standard (invoice date)", cash: "Cash accounting", flat_rate: "Flat rate" } as const;

function Vat() {
  const { businessId } = Route.useParams();
  const { data: s } = useSuspenseQuery(vatSettingsQuery(businessId));
  const { data: returns } = useSuspenseQuery(returnsQuery(businessId));
  const { data: b } = useSuspenseQuery(businessQuery(businessId));
  const role = b?.business_members[0]?.role;
  const canPost = role === "owner" || role === "accountant";
  const qc = useQueryClient();
  const search = Route.useSearch();
  const initial = quarterBounds(new Date(todayUK() + "T12:00:00Z"));
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);

  // HMRC's own sign-in lands back here with a note about how it went.
  useEffect(() => {
    const notice = hmrcNotice(search);
    if (!notice) return;
    if (notice === "Connected to HMRC.") toast.success(notice); else toast.error(notice);
    qc.invalidateQueries({ queryKey: ["hmrc-status", businessId] });
    const url = new URL(window.location.href);
    url.searchParams.delete("hmrc");
    window.history.replaceState({}, "", url);
  }, [search.hmrc, businessId, qc]);

  const filedReturn = returns.find((r) => r.period_start === start && r.period_end === end) ?? null;

  const preview = useQuery({
    queryKey: ["vat-preview", businessId, start, end, s.vat_scheme, s.flat_rate_bp],
    enabled: s.vat_registered && start <= end,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("vat_return_preview", { _business_id: businessId, _start: start, _end: end });
      if (error) throw error;
      return data as Record<string, number>;
    },
  });

  async function saveSettings(patch: { vat_scheme?: "standard" | "cash" | "flat_rate"; flat_rate_bp?: number }) {
    const { error } = await supabase.from("businesses").update(patch).eq("id", businessId);
    if (error) { toast.error(role === "owner" ? error.message : "Only the owner can change VAT settings"); return; }
    qc.invalidateQueries({ queryKey: ["vat-settings", businessId] });
  }

  async function file() {
    if (!confirm(`File the VAT return for ${start} to ${end}? It will be locked once filed.`)) return;
    const { error } = await supabase.rpc("file_vat_return", { _business_id: businessId, _start: start, _end: end });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("VAT return filed and locked");
    for (const k of ["vat-returns", "journals", "accounts"]) qc.invalidateQueries({ queryKey: [k, businessId] });
  }

  if (!s.vat_registered) {
    return <p className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground">This business isn't VAT registered, so there are no VAT returns to prepare.</p>;
  }

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">VAT</h2>
          <p className="font-mono text-xs text-muted-foreground">{s.vat_number}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5"><Label>Scheme</Label>
            <Select value={s.vat_scheme} onValueChange={(v) => saveSettings({ vat_scheme: v as "standard" | "cash" | "flat_rate" })} disabled={role !== "owner"}>
              <SelectTrigger aria-label="VAT scheme" className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(SCHEME_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {s.vat_scheme === "flat_rate" && (
            <div className="grid gap-1.5"><Label htmlFor="fr">Flat rate %</Label>
              <Input id="fr" className="w-24 font-mono" inputMode="decimal" defaultValue={(s.flat_rate_bp / 100).toString()} disabled={role !== "owner"}
                onBlur={(e) => { const v = Math.round(Number(e.target.value) * 100); if (v >= 0 && v <= 1650 && v !== s.flat_rate_bp) saveSettings({ flat_rate_bp: v }); }} />
            </div>
          )}
        </div>
      </div>
      {s.vat_scheme === "flat_rate" && <p className="-mt-4 text-xs text-muted-foreground">Use your trade's flat rate, minus 1% in your first year of VAT registration. Use 16.5% if you're a limited cost business (goods under 2% of turnover or £1,000 a year).</p>}

      <section className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5"><Label htmlFor="ps">Period start</Label><Input id="ps" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pe">Period end</Label><Input id="pe" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        {preview.error && <p className="mt-4 text-sm text-destructive">{friendlyError(preview.error)}</p>}
        {preview.data && (
          <>
            <table className="mt-6 w-full text-sm">
              <tbody>
                {VAT_BOXES.map((bx) => (
                  <tr key={bx.key} className={"border-t " + (bx.key === "box5" ? "font-semibold" : "")}>
                    <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">{bx.n}</td>
                    <td className="py-2 pr-2">{bx.label}</td>
                    <td className="py-2 text-right font-mono">{formatPence(preview.data[bx.key] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canPost && <Button className="mt-6" onClick={file}>File this return</Button>}
          </>
        )}
      </section>

      <HmrcPanel businessId={businessId} canPost={canPost} filedReturn={filedReturn} />

      <section>
        <h3 className="text-lg font-semibold">Filed returns</h3>
        {returns.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">None yet.</p> : (
          <ul className="mt-2 divide-y rounded-xl border bg-card">
            {returns.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span>{new Date(r.period_start).toLocaleDateString("en-GB")} – {new Date(r.period_end).toLocaleDateString("en-GB")} <span className="text-xs text-muted-foreground">· {SCHEME_LABEL[r.scheme]}</span>{r.hmrc_submitted_at && <span className="text-xs text-muted-foreground"> · sent to HMRC</span>}</span>
                <span className="font-mono">{r.box5 >= 0 ? "To pay " : "To reclaim "}{formatPence(Math.abs(r.box5))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
