import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { friendlyError } from "@/lib/app";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { JURISDICTION_LABEL, isValidCompanyNumber, isValidUtr, isValidVatNumber, type BusinessType, type Jurisdiction } from "@/lib/businesses";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/businesses/new")({
  head: () => ({ meta: [{ title: "Add a business — AVENZA" }, { name: "description", content: "Set up a sole trader business or limited company." }] }),
  component: NewBusiness,
});

function NewBusiness() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [type, setType] = useState<BusinessType>("sole_trader");
  const [name, setName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [utr, setUtr] = useState("");
  const [vatReg, setVatReg] = useState(false);
  const [vat, setVat] = useState("");
  const [yearEnd, setYearEnd] = useState(type === "sole_trader" ? "2027-04-05" : "2027-03-31");
  const [address, setAddress] = useState("");
  const [registeredIn, setRegisteredIn] = useState<Jurisdiction>("england_wales");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem =
      type === "limited_company" && !isValidCompanyNumber(companyNumber) ? "Company number should be 8 characters, e.g. 12345678 or SC123456."
      : utr && !isValidUtr(utr) ? "UTR should be 10 digits."
      : vatReg && !isValidVatNumber(vat) ? "That VAT number isn't valid. Check it against your VAT certificate." : null;
    if (problem) { toast.error(problem); return; }
    const d = new Date(yearEnd);
    setBusy(true);
    const { error } = await supabase.from("businesses").insert({
      name: name.trim(), business_type: type,
      company_number: type === "limited_company" ? companyNumber.trim().toUpperCase() : null,
      utr: utr.replace(/\s/g, "") || null,
      vat_registered: vatReg, vat_number: vatReg ? vat.replace(/\s/g, "").toUpperCase() : null,
      year_end_month: d.getMonth() + 1, year_end_day: d.getDate(),
      address: address.trim(), registered_in: type === "limited_company" ? registeredIn : null,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    await qc.invalidateQueries({ queryKey: ["businesses"] });
    toast.success("Business added");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <form onSubmit={submit} className="mx-auto grid max-w-lg gap-6 rounded-xl border bg-card p-8">
        <div>
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
          <h1 className="mt-2 text-3xl font-semibold">Add a business</h1>
        </div>
        <RadioGroup value={type} onValueChange={(v) => { setType(v as BusinessType); setYearEnd(v === "sole_trader" ? "2027-04-05" : "2027-03-31"); }} className="grid grid-cols-2 gap-3">
          {(["sole_trader", "limited_company"] as const).map((t) => (
            <Label key={t} htmlFor={t} className="flex cursor-pointer items-center gap-2 rounded-lg border p-4 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-secondary">
              <RadioGroupItem id={t} value={t} />{t === "sole_trader" ? "Sole trader" : "Limited company"}
            </Label>
          ))}
        </RadioGroup>
        <div className="grid gap-1.5"><Label htmlFor="bn">{type === "limited_company" ? "Registered company name" : "Trading name"}</Label><Input id="bn" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div className="grid gap-1.5"><Label htmlFor="addr">{type === "limited_company" ? "Registered office address" : "Business address"}</Label><Textarea id="addr" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} required /></div>
        {type === "limited_company" && (
          <div className="grid gap-1.5"><Label>Registered in</Label>
            <Select value={registeredIn} onValueChange={(v) => setRegisteredIn(v as Jurisdiction)}><SelectTrigger aria-label="Registered in"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(JURISDICTION_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
          </div>
        )}
        {type === "limited_company" && (
          <div className="grid gap-1.5"><Label htmlFor="cn">Companies House number</Label><Input id="cn" value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} placeholder="12345678" required /></div>
        )}
        <div className="grid gap-1.5"><Label htmlFor="utr">{type === "limited_company" ? "Corporation Tax UTR" : "Self Assessment UTR"} (optional)</Label><Input id="utr" inputMode="numeric" value={utr} onChange={(e) => setUtr(e.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="ye">Next financial year end</Label><Input id="ye" type="date" value={yearEnd} onChange={(e) => setYearEnd(e.target.value)} required /></div>
        <div className="flex items-center justify-between"><Label htmlFor="vr">VAT registered</Label><Switch id="vr" checked={vatReg} onCheckedChange={setVatReg} /></div>
        {vatReg && (<div className="grid gap-1.5"><Label htmlFor="vat">VAT number</Label><Input id="vat" value={vat} onChange={(e) => setVat(e.target.value)} placeholder="GB123456789" required /></div>)}
        <Button type="submit" disabled={busy}>Create business</Button>
      </form>
    </div>
  );
}
