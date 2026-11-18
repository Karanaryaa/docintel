const AI_BASE = process.env.AI_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

export function aiKey(): string {
  const key = process.env.AI_API_KEY;
  if (!key) throw new Error("AI_API_KEY is not set");
  return key;
}

export const CHAT_MODEL = process.env.AI_CHAT_MODEL ?? "nvidia/nemotron-3-ultra-550b-a55b";
export const VISION_MODEL = process.env.AI_VISION_MODEL ?? "nvidia/nemotron-3.5-super-vl-120b-a12b";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

async function aiChat(messages: ChatMessage[], opts: { model?: string; json?: boolean; maxTokens?: number; temperature?: number; timeoutMs?: number } = {}): Promise<string> {
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    headers: {
      Authorization: `Bearer ${aiKey()}`,
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
    throw new Error(`AI provider ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

/** Plain-text chat completion. */
export function chat(messages: ChatMessage[], opts?: Parameters<typeof aiChat>[1]) {
  return aiChat(messages, opts);
}

/**
 * Streaming chat completion: returns the raw SSE body so callers can forward
 * tokens as they arrive instead of waiting for the full answer.
 */
export async function chatStream(messages: ChatMessage[], opts: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number } = {}): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    headers: {
      Authorization: `Bearer ${aiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model ?? CHAT_MODEL,
      messages,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 1024,
      stream: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI provider ${res.status}: ${body.slice(0, 500)}`);
  }
  if (!res.body) throw new Error("AI provider returned no stream");
  return res.body;
}

/** Chat completion constrained to a JSON object response; parses and returns it. */
export async function chatJson<T>(messages: ChatMessage[], opts?: Parameters<typeof aiChat>[1]): Promise<T> {
  const raw = await aiChat(messages, { ...opts, json: true });
  return JSON.parse(raw) as T;
}

/**
 * Vision OCR: send a page raster (base64 PNG/JPEG data URL) and get back the
 * page's full text, tables included, in reading order.
 */
export function ocrPageImage(dataUrl: string, model?: string): Promise<string> {
  return aiChat(
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
