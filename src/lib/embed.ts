/**
 * Embeddings.
 *
 * When AI_API_KEY is set (production), embeddings go through the NVIDIA NIM
 * OpenAI-compatible /v1/embeddings endpoint (model AI_EMBED_MODEL, default
 * nvidia/nemotron-3.5-embed-1b). This keeps serverless cold starts fast:
 * no model files are downloaded into the function instance.
 *
 * Without a key (local dev / tests), falls back to local transformers.js with
 * Xenova/multilingual-e5-small (384 dims) so nothing leaves the machine.
 * Chunks record which model produced their embedding, so a key appearing
 * later simply re-embeds on the next upload.
 *
 * Local runs on the Node.js runtime only (not Edge).
 */
// Imported dynamically inside getPipeline(): the static import drags in
// onnxruntime-node, which is not installable in the serverless bundle, and
// production never uses the local fallback anyway (fail closed).
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

const LOCAL_MODEL = process.env.EMBEDDING_MODEL ?? "Xenova/multilingual-e5-small";
const NIM_MODEL = process.env.AI_EMBED_MODEL ?? "nvidia/nemotron-3.5-embed-1b";
const NIM_BASE = process.env.AI_BASE_URL ?? "https://integrate.api.nvidia.com/v1";

function useNim(): boolean {
  if (process.env.AI_API_KEY) return true;
  if (process.env.NODE_ENV === "production") {
    // Fail closed in production: never fall back to a different embedding
    // space than the one existing chunks were indexed with.
    throw new Error("AI_API_KEY is not set");
  }
  return false;
}

async function nimEmbed(texts: string[], inputType: "query" | "passage"): Promise<number[][]> {
  const res = await fetch(`${NIM_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: NIM_MODEL,
      input: texts,
      input_type: inputType,
      encoding_format: "float",
      truncate: "END",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Embedding provider ${res.status}: ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as { data: Array<{ index: number; embedding: number[] }> };
  return data.data
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

let pipePromise: Promise<FeatureExtractionPipeline> | null = null;

function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipePromise) {
    pipePromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      return pipeline("feature-extraction", LOCAL_MODEL, { dtype: "q8" }) as Promise<FeatureExtractionPipeline>;
    })();
  }
  return pipePromise;
}

async function localEmbedOne(text: string, prefix: "query" | "passage"): Promise<number[]> {
  const pipe = await getPipeline();
  const out = await pipe(`${prefix}: ${text}`, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

export function embedQuery(text: string): Promise<number[]> {
  if (useNim()) return nimEmbed([text], "query").then((r) => r[0]);
  return localEmbedOne(text, "query");
}

export async function embedPassages(texts: string[]): Promise<number[][]> {
  if (useNim()) {
    // batch in small groups to stay under request-size limits
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 32) {
      out.push(...(await nimEmbed(texts.slice(i, i + 32), "passage")));
    }
    return out;
  }
  const results: number[][] = [];
  // sequential batches keep peak memory low on small instances
  for (const t of texts) results.push(await localEmbedOne(t, "passage"));
  return results;
}

/** Which embedding backend is active; recorded on chunks for traceability. */
export function embeddingModel(): string {
  return useNim() ? NIM_MODEL : LOCAL_MODEL;
}
