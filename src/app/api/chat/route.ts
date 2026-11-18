export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { answerQuestion, answerQuestionEvents } from "@/lib/rag";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export const maxDuration = 300; // Hobby max with fluid compute (default-enabled)

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { question?: string; documentId?: string; stream?: boolean };
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
    if (body.stream) {
      // NDJSON stream: {"type":"delta","text":...} lines as the model
      // generates, then one {"type":"final","answer":...} with citations.
      const events = answerQuestionEvents(getStore(), question, body.documentId);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const { done, value } = await events.next();
          if (done) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
        },
        async cancel() {
          await events.return(undefined);
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
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
