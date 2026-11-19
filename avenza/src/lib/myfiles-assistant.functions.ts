import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiLimitMessage } from "./ai/limits";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayUK } from "./app";
import { monthStartISO } from "./myfiles";

export const askMyFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        question: z
          .string()
          .trim()
          .min(1, "Ask a question first")
          .max(500, "Keep your question under 500 characters"),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const facts = await sb.rpc("pf_assistant_facts", { _month: monthStartISO(todayUK()) });
    if (facts.error) throw new Error("Couldn't read your saved records. Please try again.");
    const metadata = z
      .object({ has_data: z.boolean(), generated_at: z.string() })
      .passthrough()
      .parse(facts.data);
    if (!metadata.has_data)
      return {
        ok: true as const,
        hasData: false,
        answer: "There is nothing saved yet. Add a document or transaction first.",
        generatedAt: metadata.generated_at,
      };
    const limited = await aiLimitMessage(sb, "myfiles_question");
    if (limited) return { ok: false as const, message: limited };
    const { answerFromFacts } = await import("./myfiles-assistant.server");
    const result = await answerFromFacts(facts.data, data.question);
    // Provider denials are reported for this request only; the next question tries again.
    if (!result.ok) return { ok: false as const, message: result.message };
    return {
      ok: true as const,
      hasData: true,
      answer: result.answer,
      generatedAt: metadata.generated_at,
    };
  });
