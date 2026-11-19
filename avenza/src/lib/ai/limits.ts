// Ask the database for one AI request's worth of allowance (migration 0022). Server-only use.
export type AiKind = "bank_category" | "document_read" | "myfiles_question" | "report_question";
type Rpc = {
  rpc: (
    fn: "take_ai_slot",
    args: { _kind: AiKind },
  ) => PromiseLike<{ data: boolean | null; error: unknown }>;
};

export const AI_LIMIT_MESSAGE =
  "You've reached today's limit for AI help. It resets over the next 24 hours; everything else works as normal.";

/** null = go ahead; otherwise the message to show. Fails closed: if the check itself fails, no AI call. */
export async function aiLimitMessage(sb: Rpc, kind: AiKind): Promise<string | null> {
  const { data, error } = await sb.rpc("take_ai_slot", { _kind: kind });
  if (error) return "AI help is unavailable right now. Please try again later.";
  return data === true ? null : AI_LIMIT_MESSAGE;
}
