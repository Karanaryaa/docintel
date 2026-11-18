/**
 * Local embeddings via transformers.js - no external API, document text never
 * leaves the deployment for embedding. Default model is multilingual-e5-small
 * (384 dims, ~118MB fp32 / ~30MB quantized) so Hinglish and non-English
 * documents embed sensibly; override with EMBEDDING_MODEL.
 *
 * Runs on the Node.js runtime only (not Edge). On Vercel the model files are
 * downloaded on cold start into /tmp and cached per warm instance.
 */
import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

const MODEL = process.env.EMBEDDING_MODEL ?? "Xenova/multilingual-e5-small";

let pipePromise: Promise<FeatureExtractionPipeline> | null = null;

function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipePromise) {
    pipePromise = pipeline("feature-extraction", MODEL, { dtype: "q8" }) as Promise<FeatureExtractionPipeline>;
  }
  return pipePromise;
}

async function embedOne(text: string, prefix: "query" | "passage"): Promise<number[]> {
  const pipe = await getPipeline();
  const out = await pipe(`${prefix}: ${text}`, { pooling: "mean", normalize: true });
  return Array.from(out.data as Float32Array);
}

export function embedQuery(text: string) {
  return embedOne(text, "query");
}

export async function embedPassages(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  // sequential batches keep peak memory low on small instances
  for (const t of texts) results.push(await embedOne(t, "passage"));
  return results;
}

export const EMBEDDING_DIMS = 384;
