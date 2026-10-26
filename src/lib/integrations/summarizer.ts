import { env } from "@/lib/env";

const TIMEOUT_MS = 10_000;

type ChatResponse = {
  choices?: { message?: { content?: unknown } }[];
};

export async function summarizeDescription(description: string): Promise<string> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Summarize the travel description in 1-2 sentences, using at most 40 words. Return only the summary.",
          },
          { role: "user", content: description },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter request failed (${response.status})`);
    }
    return summaryText((await response.json()) as ChatResponse);
  } catch (error) {
    if (isTimeout(error)) {
      throw new Error("OpenRouter request timed out");
    }
    throw error;
  }
}

function summaryText(payload: ChatResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("OpenRouter returned an empty summary");
  }
  return content.trim();
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
