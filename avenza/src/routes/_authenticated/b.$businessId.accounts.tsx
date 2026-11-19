import { createFileRoute } from "@tanstack/react-router";
import { friendlyError } from "@/lib/app";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABEL, accountsQuery, businessQuery, formatPence, naturalBalance, type AccountType } from "@/lib/ledger";

export const Route = createFileRoute("/_authenticated/b/$businessId/accounts")({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(accountsQuery(params.businessId)),
  head: () => ({ meta: [{ title: "Chart of accounts — AVENZA" }, { name: "description", content: "Your accounts and running balances." }] }),
  component: Accounts,
});

function Accounts() {
  const { businessId } = Route.useParams();
  const { data: accounts } = useSuspenseQuery(accountsQuery(businessId));
  const { data: b } = useSuspenseQuery(businessQuery(businessId));
  const role = b?.business_members[0]?.role;
  const canEdit = role === "owner" || role === "accountant";
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("expense");

  async function add(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("accounts").insert({ business_id: businessId, code: code.trim(), name: name.trim(), account_type: type });
    if (error) { toast.error(error.code === "23505" ? "That account code is already used." : error.message); return; }
    setCode(""); setName("");
    qc.invalidateQueries({ queryKey: ["accounts", businessId] });
  }

  async function toggleArchive(id: string, archived: boolean) {
    const { error } = await supabase.from("accounts").update({ archived: !archived }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["accounts", businessId] });
  }

  return (
    <div className="grid gap-8">
      <h2 className="text-2xl font-semibold">Chart of accounts</h2>
      {canEdit && (
        <form onSubmit={add} className="grid gap-2 rounded-xl border bg-card p-4 sm:grid-cols-[6rem_1fr_10rem_auto]">
          <Input aria-label="Code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input aria-label="Name" placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
            <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
            <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
          </Select>
          <Button type="submit">Add account</Button>
        </form>
      )}
      {ACCOUNT_TYPES.map((t) => {
        const list = accounts.filter((a) => a.account_type === t);
        if (!list.length) return null;
        return (
          <section key={t}>
            <h3 className="text-lg font-semibold">{ACCOUNT_TYPE_LABEL[t]}</h3>
            <ul className="mt-2 divide-y rounded-xl border bg-card">
              {list.map((a) => (
                <li key={a.account_id} className={"flex items-center justify-between gap-3 px-4 py-2 " + (a.archived ? "opacity-50" : "")}>
                  <span><span className="font-mono text-xs text-muted-foreground">{a.code}</span> {a.name}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-sm">{formatPence(naturalBalance(t, a.debit_pence ?? 0, a.credit_pence ?? 0))}</span>
                    {canEdit && <Button variant="ghost" size="sm" onClick={() => toggleArchive(a.account_id!, !!a.archived)}>{a.archived ? "Restore" : "Archive"}</Button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
