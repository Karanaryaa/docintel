/**
 * Rate limiting. When Supabase is configured (production), counters live in
 * the rate_limits table so limits hold across serverless instances. Local
 * development falls back to an in-memory sliding window.
 *
 * Demo-grade: races can let a few extra requests through; the point is to cap
 * token spend and upload volume on a shared free-tier deployment.
 */
const buckets = new Map<string, number[]>();

function memoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}

async function supabaseLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const base = process.env.SUPABASE_URL!;
  const key_ = process.env.SUPABASE_SECRET_KEY!;
  const headers = { apikey: key_, Authorization: `Bearer ${key_}`, "Content-Type": "application/json" };
  const url = `${base}/rest/v1/rate_limits?bucket=eq.${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`rate limit read ${res.status}`);
  const rows = (await res.json()) as Array<{ window_start: string; count: number }>;
  const now = Date.now();
  if (rows.length === 0 || now - Date.parse(rows[0].window_start) > windowMs) {
    const r = await fetch(`${base}/rest/v1/rate_limits`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ bucket: key, window_start: new Date(now).toISOString(), count: 1 }),
    });
    if (!r.ok) throw new Error(`rate limit write ${r.status}`);
    return true;
  }
  if (rows[0].count >= limit) return false;
  await fetch(url, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ count: rows[0].count + 1 }),
  });
  return true;
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      return await supabaseLimit(key, limit, windowMs);
    } catch {
      // limiter backend hiccup: fall back to per-instance rather than blocking users
      return memoryLimit(key, limit, windowMs);
    }
  }
  return memoryLimit(key, limit, windowMs);
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : "local") || "local";
}
