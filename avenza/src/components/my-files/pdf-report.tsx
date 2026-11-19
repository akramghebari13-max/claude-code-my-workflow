import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addMonthsISO } from "@/lib/myfiles";
import { friendlyError } from "@/lib/app";
import { Button } from "@/components/ui/button";
import type { OverviewData } from "./overview";

export function PersonalPdfButton({ month, data }: { month: string; data: OverviewData }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const previous = await Promise.all(
        [3, 2, 1].map(async (n) => {
          const date = addMonthsISO(month, -n);
          const result = await supabase.rpc("pf_month_summary", { _month: date });
          if (result.error || !result.data?.[0])
            throw new Error("Couldn't read your earlier monthly totals");
          return { month: date, ...result.data[0] };
        }),
      );
      const bills = [];
      for (let offset = 0; ; offset += 500) {
        const result = await supabase
          .from("pf_bills")
          .select("name,amount_pence,next_due_date,active")
          .order("id")
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        bills.push(...result.data);
        if (result.data.length < 500) break;
      }
      const goals = await supabase.rpc("pf_goal_progress");
      if (goals.error) throw goals.error;
      const { buildPersonalReport } = await import("@/lib/myfiles-pdf");
      buildPersonalReport({
        month,
        generatedAt: new Date().toISOString(),
        summary: data.summary,
        categories: data.totals,
        previous,
        bills,
        goals: goals.data ?? [],
      }).save(`my-files-report-${month.slice(0, 7)}.pdf`);
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" disabled={busy} onClick={download}>
      <Download className="mr-2 size-4" />
      {busy ? "Preparing report…" : "Download PDF report"}
    </Button>
  );
}
