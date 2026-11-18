export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { answerQuestion } from "@/lib/rag";

export const maxDuration = 300; // Hobby max with fluid compute (default-enabled)

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { question?: string; documentId?: string };
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  const answer = await answerQuestion(getStore(), question, body.documentId);
  return NextResponse.json(answer);
}
