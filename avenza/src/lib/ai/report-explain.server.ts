import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, streamText } from "ai";
import { createLovableAiGatewayRunIdFetch } from "./run-id";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `You are AVENZA's bookkeeping assistant for UK small businesses (sole traders and limited companies).
Explain the user's own report figures in plain English, briefly (under 200 words unless asked for more), using £ amounts exactly as given.
Rules:
- Only use the figures provided. If something isn't in the data, say so; never invent numbers.
- Tax figures are estimates from the app; say they are estimates, not tax advice, and suggest an accountant for decisions.
- Don't claim anything is HMRC-approved or compliant.
- Use short paragraphs or bullet points. No tables.`;

export type ExplainResult = { answer: string } | { error: string };

export async function explainReport(context: string, question: string, signal?: AbortSignal): Promise<ExplainResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { error: "The AI assistant isn't set up yet." };
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  const provider = createOpenAI({
    baseURL: GATEWAY,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
  try {
    const result = streamText({
      model: provider.responses(MODEL),
      instructions: INSTRUCTIONS,
      messages: [{ role: "user", content: `REPORT DATA\n${context}\n\nQUESTION\n${question}` }],
      ...(signal ? { abortSignal: signal } : {}),
      maxRetries: 0,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    const text = (await result.text).trim();
    const finish = await result.finishReason;
    if (!text) return { error: finish === "content-filter" ? "The assistant can't answer that question." : "The assistant didn't return an answer. Please ask again." };
    return { answer: text };
  } catch (e) {
    const status = APICallError.isInstance(e) ? e.statusCode : undefined;
    console.error("report explain failed", status, e instanceof Error ? e.message : e);
    if (status === 402) return { error: "AI credits have run out for this workspace. Add credits in Settings → Plans & credits." };
    if (status === 429) return { error: "The assistant is busy. Please wait a moment and try again." };
    if (status === 403) return { error: "The assistant isn't available for this workspace right now." };
    return { error: "The assistant couldn't answer right now. Please try again later." };
  }
}
