import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/app";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { businessQuery } from "@/lib/ledger";
import { JURISDICTION_LABEL, isValidCompanyNumber, isValidUtr, isValidVatNumber, type Jurisdiction } from "@/lib/businesses";

export const Route = createFileRoute("/_authenticated/b/$businessId/settings")({
  head: () => ({ meta: [{ title: "Business settings — AVENZA" }, { name: "description", content: "Business details used on invoices and returns." }] }),
  component: Settings,
});

function Settings() {
  const { businessId } = Route.useParams();
  const { data: b } = useSuspenseQuery(businessQuery(businessId));
  const qc = useQueryClient();
  const isOwner = b?.business_members[0]?.role === "owner";
  const ltd = b?.business_type === "limited_company";
  const [name, setName] = useState(b?.name ?? "");
  const [address, setAddress] = useState(b?.address ?? "");
  const [registeredIn, setRegisteredIn] = useState<Jurisdiction>(b?.registered_in ?? "england_wales");
  const [companyNumber, setCompanyNumber] = useState(b?.company_number ?? "");
  const [utr, setUtr] = useState(b?.utr ?? "");
  const [vatReg, setVatReg] = useState(!!b?.vat_registered);
  const [vat, setVat] = useState(b?.vat_number ?? "");

  async function save(e: FormEvent) {
    e.preventDefault();
    const problem = ltd && !isValidCompanyNumber(companyNumber) ? "Company number should be 8 characters, e.g. 12345678 or SC123456."
      : utr && !isValidUtr(utr) ? "UTR should be 10 digits."
      : vatReg && !isValidVatNumber(vat) ? "That VAT number isn't valid. Check it against your VAT certificate." : null;
    if (problem) { toast.error(problem); return; }
    const { error } = await supabase.from("businesses").update({
      name: name.trim(), address: address.trim(), registered_in: ltd ? registeredIn : null,
      company_number: ltd ? companyNumber.trim().toUpperCase() : null, utr: utr.replace(/\s/g, "") || null,
      vat_registered: vatReg, vat_number: vatReg ? vat.replace(/\s/g, "").toUpperCase() : null,
    }).eq("id", businessId);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["business", businessId] });
    qc.invalidateQueries({ queryKey: ["businesses"] });
    qc.invalidateQueries({ queryKey: ["vat-settings", businessId] });
  }

  if (!b) return null;
  return (
    <form onSubmit={save} className="grid max-w-lg gap-5">
      <h2 className="text-2xl font-semibold">Business details</h2>
      {!isOwner && <p className="text-sm text-muted-foreground">Only the owner can change these details.</p>}
      <fieldset disabled={!isOwner} className="grid gap-5">
        <div className="grid gap-1.5"><Label htmlFor="n">Name</Label><Input id="n" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid gap-1.5"><Label htmlFor="a">{ltd ? "Registered office address" : "Business address"}</Label><Textarea id="a" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
        {ltd && (
          <>
            <div className="grid gap-1.5"><Label>Registered in</Label>
              <Select value={registeredIn} onValueChange={(v) => setRegisteredIn(v as Jurisdiction)} disabled={!isOwner}><SelectTrigger aria-label="Registered in"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(JURISDICTION_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="grid gap-1.5"><Label htmlFor="cn">Companies House number</Label><Input id="cn" value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} required /></div>
          </>
        )}
        <div className="grid gap-1.5"><Label htmlFor="u">UTR</Label><Input id="u" value={utr} onChange={(e) => setUtr(e.target.value)} /></div>
        <div className="flex items-center justify-between"><Label htmlFor="vr">VAT registered</Label><Switch id="vr" checked={vatReg} onCheckedChange={setVatReg} /></div>
        {vatReg && <div className="grid gap-1.5"><Label htmlFor="v">VAT number</Label><Input id="v" value={vat} onChange={(e) => setVat(e.target.value)} required /></div>}
        <Button type="submit" className="justify-self-start">Save</Button>
      </fieldset>
    </form>
  );
}
