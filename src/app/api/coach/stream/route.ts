import { getCharacter } from "@/lib/coach/characters";
import type { Locale } from "@/lib/coach/characters";
import {
  streamCoachComment,
  type CoachSituation,
} from "@/lib/coach/featherless";

/**
 * SSE streaming endpoint for live coach/bot commentary.
 *
 * POST body: {
 *   characterId: "ata" | "zhanar" | ...,
 *   locale: "ru" | "en" | "kz",
 *   situation: CoachSituation,   // see featherless.ts for shape
 * }
 *
 * Response: text/event-stream — each chunk arrives as `data: <text>\n\n`,
 * end-of-stream signaled with `data: [DONE]\n\n`. The client reads via
 * EventSource or fetch+stream-reader to render typewriter-style.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  characterId?: string;
  locale?: Locale;
  situation?: CoachSituation;
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) {
    return new Response("FEATHERLESS_API_KEY not configured", { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const character = body.characterId ? getCharacter(body.characterId) : null;
  if (!character) {
    return new Response("Unknown characterId", { status: 400 });
  }

  if (!body.situation) {
    return new Response("Missing situation", { status: 400 });
  }

  const locale: Locale = body.locale ?? "ru";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const piece of streamCoachComment(
          apiKey,
          character,
          body.situation!,
          locale
        )) {
          // SSE frame: `data: <payload>\n\n`. We JSON-encode to keep
          // multi-line / unicode safe across the wire.
          const frame = `data: ${JSON.stringify({ delta: piece })}\n\n`;
          controller.enqueue(encoder.encode(frame));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream_error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
