import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { historyFromTransactions, historyMatch, pickCategory, type CatOption } from "./categorise";

/** Suggest a category for one bank line: past history first, then Lovable AI. Never posts anything. */
export const suggestCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { lineId: string }) => {
    if (typeof i?.lineId !== "string" || !/^[0-9a-f-]{36}$/i.test(i.lineId)) throw new Error("Invalid request");
    return { lineId: i.lineId };
  })
  .handler(async ({ data, context }): Promise<{ categoryId: string | null; source: "history" | "ai" | null }> => {
    const sb = context.supabase;
    const { data: line } = await sb.from("bank_statement_lines").select("business_id, description, amount_pence").eq("id", data.lineId).maybeSingle();
    if (!line) return { categoryId: null, source: null };
    const type = line.amount_pence > 0 ? "income" : "expense";
    const { data: accs } = await sb.from("accounts").select("id, code, name").eq("business_id", line.business_id).eq("account_type", type).eq("archived", false);
    const options = (accs ?? []) as CatOption[];
    if (!options.length) return { categoryId: null, source: null };

    const { data: past } = await sb.from("transactions").select("counterparty, category_account_id")
      .eq("business_id", line.business_id).is("voided_at", null).order("txn_date", { ascending: false }).limit(300);
    const hist = historyMatch(line.description, historyFromTransactions(past ?? []));
    if (hist && options.some((o) => o.id === hist)) return { categoryId: hist, source: "history" };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { categoryId: null, source: null };
    try {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const { streamText } = await import("ai");
      const { createLovableAiGatewayRunIdFetch } = await import("./ai/run-id");
      const provider = createOpenAI({
        baseURL: "https://ai.gateway.lovable.dev/v1", apiKey,
        headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        fetch: createLovableAiGatewayRunIdFetch().fetch,
      });
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        instructions: "You categorise UK small-business bank lines. Reply with only the account code from the list that fits best, or NONE.",
        messages: [{ role: "user", content: `Bank line: "${line.description.slice(0, 200)}" (${type === "income" ? "money in" : "money out"})\nAccounts:\n${options.map((o) => `${o.code} ${o.name}`).join("\n")}` }],
        maxRetries: 0,
        providerOptions: { openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
      });
      const pick = pickCategory(await result.text, options);
      return { categoryId: pick?.id ?? null, source: pick ? "ai" : null };
    } catch {
      return { categoryId: null, source: null };
    }
  });
