// Quarterly Income Tax updates on the Reports page, with HMRC and the books faked.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/itsa.functions", () => ({
  itsaStatus: async () => ({
    configured: true,
    isSandbox: true,
    canPost: true,
    status: { nino_hint: "••••56C", is_sandbox: true, connected_at: "", expired: false },
  }),
  itsaSendFigures: (a: unknown) => send(a),
  itsaCalculate: vi.fn(),
  itsaFinalDeclaration: vi.fn(),
  startItsaAuth: vi.fn(),
  disconnectItsa: vi.fn(),
}));
vi.mock("@/lib/app", () => ({ todayUK: () => "2026-11-19" }));
vi.mock("@/lib/hmrc", () => ({ collectHmrcFraudData: () => ({}) }));
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => {
  // the history query: Q1 was sent in August
  const hist = [
    {
      id: "1",
      kind: "figures",
      submitted_at: "2026-08-01T10:00:00Z",
      is_sandbox: true,
      figures: { from: "2026-04-06", to: "2026-07-05", quarter: 1 },
    },
  ];
  type Chain = {
    select(): Chain;
    eq(): Chain;
    order(): Chain;
    limit(): Promise<{ data: typeof hist }>;
  };
  const chain: Chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: async () => ({ data: hist }),
  };
  return { supabase: { from: () => chain, rpc: (...a: unknown[]) => rpc(...a) } };
});

import { ItsaPanel } from "./itsa-panel";

function show() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ItsaPanel businessId="b1" startYear={2026} />
    </QueryClientProvider>,
  );
}

describe("Quarterly Income Tax updates", () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ ok: true });
    rpc.mockReset().mockResolvedValue({
      data: [
        { account_type: "income", credit_pence: 2_400_000, debit_pence: 0 },
        { account_type: "expense", credit_pence: 0, debit_pence: 650_000 },
      ],
      error: null,
    });
  });

  it("lists each quarter with its HMRC deadline and whether it's been sent", async () => {
    show();
    const list = await screen.findByRole("list", { name: "Quarterly update deadlines" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")[0]).toHaveTextContent("Sent"));
    const rows = within(list)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(rows[0]).toContain("Q1 · 6 Apr – 5 Jul 2026due 7 Aug 2026");
    expect(rows[1]).toContain("due 7 Nov 2026");
    expect(rows[1]).toContain("Overdue");
    expect(rows[2]).toContain("Quarter not ended");
    expect(rows[3]).toContain("due 7 May 2027");
    expect(rows[4]).toContain("due 31 Jan 2028");
  });

  it("offers the overdue quarter, shows its figures from the books, and sends that quarter", async () => {
    show();
    const button = await screen.findByRole("button", { name: "1. Send Q2 update to HMRC" });
    expect(rpc).toHaveBeenCalledWith("period_balances", {
      _business_id: "b1",
      _from: "2026-04-06",
      _to: "2026-10-05",
    });
    await waitFor(() =>
      expect(screen.getByText("Profit").nextSibling?.textContent).toBe("£17,500.00"),
    );
    fireEvent.click(button);
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        data: { businessId: "b1", taxYear: "2026-27", quarter: 2, fraud: {} },
      }),
    );
    expect(
      await screen.findByText("Q1 update sent (sandbox)", { exact: false }),
    ).toBeInTheDocument();
  });
});
