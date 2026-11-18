const GROQ_BASE = "https://api.groq.com/openai/v1";

export function groqKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY is not set");
  return key;
}

export const CHAT_MODEL = process.env.GROQ_CHAT_MODEL ?? "openai/gpt-oss-120b";
export const VISION_MODEL = process.env.GROQ_VISION_MODEL ?? "qwen/qwen3.8-27b";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

async function groqChat(messages: ChatMessage[], opts: { model?: string; json?: boolean; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Groq ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

/** Plain-text chat completion. */
export function chat(messages: ChatMessage[], opts?: Parameters<typeof groqChat>[1]) {
  return groqChat(messages, opts);
}

/** Chat completion constrained to a JSON object response; parses and returns it. */
export async function chatJson<T>(messages: ChatMessage[], opts?: Parameters<typeof groqChat>[1]): Promise<T> {
  const raw = await groqChat(messages, { ...opts, json: true });
  return JSON.parse(raw) as T;
}

/**
 * Vision OCR: send a page raster (base64 PNG/JPEG data URL) and get back the
 * page's full text, tables included, in reading order.
 */
export function ocrPageImage(dataUrl: string, model?: string): Promise<string> {
  return groqChat(
    [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Transcribe this document page exactly. Preserve reading order. Render tables as markdown tables. Output only the page content, no commentary.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    { model: model ?? VISION_MODEL, maxTokens: 4096 }
  );
}
