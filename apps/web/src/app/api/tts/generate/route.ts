/**
 * POST /api/tts/generate — start a blind TTS battle.
 *
 * Login required. Validates the prompt (non-empty, ≤1000 chars, English),
 * rejects already-consumed dataset prompts, generates two anonymous clips, and
 * returns only the opaque session id + audio URLs. Model identities stay on the
 * server until the user votes.
 */
import { NextResponse } from "next/server";
import {
  ttsGenerateRequestSchema,
  type GenerateResponse,
  SESSION_TTL_SECONDS,
} from "@ttsa/shared";
import { currentUser } from "@/server/auth/user";
import { generateBattle } from "@/server/arena/generate";
import { isConsumed, isEnglish } from "@/server/arena/sentences";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "login required" }, { status: 401 });
  }

  const parsed = ttsGenerateRequestSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid or too long text" },
      { status: 400 },
    );
  }
  const text = parsed.data.text.trim();

  if (!isEnglish(text)) {
    return NextResponse.json(
      { error: "English-only for now — multilingual is coming soon" },
      { status: 400 },
    );
  }
  if (await isConsumed(text)) {
    return NextResponse.json(
      { error: "that prompt has already been used — try another" },
      { status: 400 },
    );
  }

  try {
    const session = await generateBattle({
      userId: user.id,
      modelType: "tts",
      text,
    });
    const body: GenerateResponse = {
      sessionId: session.id,
      audioA: `/api/tts/audio/${session.id}/a`,
      audioB: `/api/tts/audio/${session.id}/b`,
      expiresIn: SESSION_TTL_SECONDS,
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      {
        error: "failed to generate audio",
        detail: err instanceof Error ? err.message : undefined,
      },
      { status: 502 },
    );
  }
}
