export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { answerQuestion } from "@/lib/rag";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const maxDuration = 300; // Hobby max with fluid compute (default-enabled)

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { question?: string; documentId?: string };
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "question too long (2000 chars max)" }, { status: 413 });
  }
  if (!(await rateLimit(`chat:${clientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ error: "rate limit: 20 questions per minute" }, { status: 429 });
  }
  // Chat is always scoped to one document: answers and saved chats are
  // per file, so the API requires the file to answer from.
  if (!body.documentId) {
    return NextResponse.json({ error: "documentId is required" }, { status: 400 });
  }
  try {
    const answer = await answerQuestion(getStore(), question, body.documentId);
    return NextResponse.json(answer);
  } catch (err) {
    // Model/embedding calls carry hard timeouts; surface them honestly
    // instead of hanging until the function limit.
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return NextResponse.json(
        { error: "The AI service took too long to respond. Please try again." },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: "The AI service could not answer right now. Please try again." },
      { status: 502 }
    );
  }
}
