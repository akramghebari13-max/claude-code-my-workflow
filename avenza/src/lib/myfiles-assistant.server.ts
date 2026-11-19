import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayRunIdFetch } from "./ai/run-id";
import { assembleAssistantPrompt, guardAssistantAnswer } from "./myfiles-assistant";

export async function answerFromFacts(facts: unknown, question: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey)
    return {
      ok: false as const,
      message: "AI needs its configuration checked. Your records are still available in Overview.",
      providerDenied: false,
    };
  const run = createLovableAiGatewayRunIdFetch();
  let message = "Couldn't check your records right now. Please try again later.";
  let providerDenied = false;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const response = await run.fetch(input, init);
      if (!response.ok) {
        const body: unknown = await response
          .clone()
          .json()
          .catch(() => null);
        const parsed = z
          .object({
            message: z.string().optional(),
            error: z
              .object({ message: z.string().optional(), type: z.string().optional() })
              .passthrough()
              .optional(),
            type: z.string().optional(),
          })
          .passthrough()
          .safeParse(body);
        const upstream = parsed.success
          ? (parsed.data.message ?? parsed.data.error?.message)
          : undefined;
        const type = parsed.success ? (parsed.data.type ?? parsed.data.error?.type) : undefined;
        if (response.status === 402)
          message =
            upstream ?? "AI credits are unavailable. Add credits in Settings → Plans & credits.";
        else if (response.status === 403) {
          message = `AI access denied: ${upstream ?? "Access needs to be restored before asking again."}`;
          // Workspace limits/configuration are not provider account denials.
          providerDenied =
            ![
              "credit_limit_reached",
              "model_vendor_not_enabled",
              "provider_not_available_in_region",
              "model_requires_retention_consent",
              "ai_disabled",
            ].includes(type ?? "") && /provider|permission|access denied/i.test(upstream ?? "");
        } else if (response.status === 429)
          message = "AI is busy. Wait a little before trying again.";
        else if (response.status === 401)
          message =
            "AI needs its configuration checked. Your records are still available in Overview.";
        else if (upstream) message = upstream;
      }
      return response;
    },
  });
  const prompt = assembleAssistantPrompt(facts, question);
  try {
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      maxRetries: 0,
      instructions: prompt.instructions,
      messages: [{ role: "user", content: prompt.content }],
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
    const text = await result.text;
    return { ok: true as const, answer: guardAssistantAnswer(text, facts) };
  } catch {
    return { ok: false as const, message: message.slice(0, 500), providerDenied };
  }
}
