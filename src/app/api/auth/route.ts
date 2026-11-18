export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/lib/ratelimit";

async function digest(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  if (!(await rateLimit(`auth:${clientIp(req)}`, 5, 60_000))) {
    return NextResponse.json({ error: "too many attempts, wait a minute" }, { status: 429 });
  }
  const code = process.env.APP_ACCESS_CODE;
  if (!code) return NextResponse.json({ ok: true });
  const { code: supplied } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!supplied || (await digest(supplied)) !== (await digest(code))) {
    return NextResponse.json({ error: "wrong code" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set("pt_auth", await digest(code), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
