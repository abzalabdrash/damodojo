import { fetchCoachComment } from "@/lib/coach/featherless";
import type { CoachCommentRequest } from "@/lib/coach/featherless";

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "FEATHERLESS_API_KEY not configured" }, { status: 503 });
  }

  let body: CoachCommentRequest;
  try {
    body = await request.json() as CoachCommentRequest;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.move?.moveClass) {
    return Response.json({ error: "Missing move data" }, { status: 400 });
  }

  try {
    const comment = await fetchCoachComment(apiKey, body);
    return Response.json({ comment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
