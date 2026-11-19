import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { collectHmrcFraudData } from "@/lib/hmrc";
import { disconnectHmrc, hmrcStatus, startHmrcAuth, submitHmrcVatReturn } from "@/lib/hmrc.functions";

export type HmrcFiledReturn = {
  id: string;
  period_start: string;
  period_end: string;
  hmrc_submitted_at: string | null;
};

const HMRC_NOTICE: Record<string, string> = {
  connected: "Connected to HMRC.",
  cancelled: "HMRC sign-in was cancelled.",
  invalid: "That HMRC sign-in link had expired. Start it again.",
  nocode: "HMRC didn't send back a sign-in code. Start it again.",
  novat: "Add a valid VAT number in Settings, then connect HMRC again.",
  unconfigured: "AVENZA isn't set up for HMRC yet, so the sign-in couldn't be finished.",
  failed: "HMRC sign-in didn't finish. Try again.",
};

export function hmrcNotice(search: Record<string, unknown>): string | null {
  const key = typeof search["hmrc"] === "string" ? search["hmrc"] : "";
  return HMRC_NOTICE[key] ?? null;
}

/**
 * The HMRC (Making Tax Digital) card on the VAT tab: connects the business to HMRC's own
 * sign-in, then sends a filed return. Figures always come from the locked return in the
 * database, never from the browser.
 */
export function HmrcPanel({
  businessId, canPost, filedReturn,
}: {
  businessId: string;
  canPost: boolean;
  filedReturn: HmrcFiledReturn | null;
}) {
  const qc = useQueryClient();
  const getStatus = useServerFn(hmrcStatus);
  const startAuth = useServerFn(startHmrcAuth);
  const sendReturn = useServerFn(submitHmrcVatReturn);
  const drop = useServerFn(disconnectHmrc);

  const q = useQuery({
    queryKey: ["hmrc-status", businessId],
    queryFn: () => getStatus({ data: { businessId } }),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["hmrc-status", businessId] });

  async function connect() {
    const res = await startAuth({ data: { businessId } });
    if (res.error) { toast.error(res.error); return; }
    const opened = window.open(res.url, "_blank", "noopener");
    if (!opened) window.location.href = res.url;
  }

  async function send() {
    if (!filedReturn) return;
    const dates = `${new Date(filedReturn.period_start).toLocaleDateString("en-GB")} to ${new Date(filedReturn.period_end).toLocaleDateString("en-GB")}`;
    if (!confirm(`Send the VAT return for ${dates} to HMRC?\n\nThis is a legal declaration that the figures are correct. It cannot be undone from AVENZA.`)) return;
    const res = await sendReturn({ data: { businessId, returnId: filedReturn.id, fraud: collectHmrcFraudData() } });
    if (res.error) { toast.error(res.error); return; }
    toast.success(`Return sent to HMRC (period ${res.periodKey})`);
    qc.invalidateQueries({ queryKey: ["vat-returns", businessId] });
    refresh();
  }

  async function disconnect() {
    if (!confirm("Disconnect this business from HMRC? You can connect again later.")) return;
    const res = await drop({ data: { businessId } });
    if (res.error) { toast.error(res.error); return; }
    toast.success("Disconnected from HMRC");
    refresh();
  }

  if (q.isPending) return <p className="text-sm text-muted-foreground">Checking your HMRC connection…</p>;
  const s = q.data;

  if (!s?.configured) {
    return (
      <section className="rounded-xl border border-dashed bg-card p-6">
        <h3 className="text-lg font-semibold">HMRC (Making Tax Digital)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          AVENZA isn't connected to HMRC yet. Sending returns from here needs your own free HMRC developer app.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
          <li>Create an app on the HMRC Developer Hub and turn on the <span className="font-medium">VAT (MTD)</span> API.</li>
          <li>Add this exact redirect URI to the app: <span className="font-mono text-xs">{s?.redirectUri}</span></li>
          <li>Send AVENZA the app's client ID and secret, and say whether to use HMRC's test or live system.</li>
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">
          Until then the VAT tab works exactly as before: you preview the nine boxes, file them here to lock the figures, and send the return on the HMRC website.
        </p>
        <Button variant="outline" className="mt-4" onClick={refresh}>Check again</Button>
      </section>
    );
  }

  const status = s.status;

  return (
    <section className="rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">HMRC (Making Tax Digital)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {status ? (
              <>
                Connected to HMRC's {status.is_sandbox ? "test" : "live"} system
                {" · VAT "}
                <span className="font-mono">{status.mtd_vat_id}</span>
                {status.customer_name ? ` · ${status.customer_name}` : ""}
                {status.expired ? " · sign-in has run out, connect again" : ""}
              </>
            ) : (
              "Not connected to HMRC yet."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!status && (
            <Button onClick={connect} disabled={!canPost} title={canPost ? undefined : "Only the owner or their accountant can connect HMRC"}>
              Connect HMRC account
            </Button>
          )}
          {status && <Button variant="outline" onClick={disconnect}>Disconnect</Button>}
        </div>
      </div>

      {status && filedReturn && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {filedReturn.hmrc_submitted_at ? (
              <>Already sent to HMRC on {new Date(filedReturn.hmrc_submitted_at).toLocaleString("en-GB")}.</>
            ) : (
              "This filed return hasn't been sent to HMRC yet."
            )}
          </p>
          {!filedReturn.hmrc_submitted_at && (
            <Button onClick={send} disabled={!canPost} title={canPost ? undefined : "Only the owner or their accountant can send returns"}>
              Send this return to HMRC
            </Button>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {s.isSandbox
          ? "AVENZA is pointed at HMRC's test system: nothing reaches your real tax record."
          : "AVENZA is pointed at HMRC's live system: sending a return is a legal declaration."}
      </p>
    </section>
  );
}
