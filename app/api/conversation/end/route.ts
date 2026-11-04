import { createClaudeClient } from "@/lib/claude-client";
import { closeConversation, ConversationError } from "@/lib/conversation";
import { visitorForRequest } from "@/lib/visitors";
import { acquireRunLease, isSameOrigin, limitRequestTraffic, limitTogether, readLimitedBody, requestAddress, securityErrorResponse } from "@/lib/security";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "送信元を確認できません" }, { status: 403 });
  try {
    await limitRequestTraffic(request, "end", requestAddress(request));
    const visitor = visitorForRequest(request);
    const bytes = await readLimitedBody(request, 1024);
    const body = await new Response(bytes).json().catch(() => null);
    if (typeof body?.id !== "string" || !/^[a-f0-9]{64}$/.test(body.id)) return Response.json({ error: "会話を指定してください" }, { status: 400 });
    const release = await acquireRunLease(visitor.id);
    try { await closeConversation(body.id, visitor.id, createClaudeClient(), () => {
      request.signal.throwIfAborted();
      return limitTogether("accepted", [
      { key: `end:${visitor.id}`, count: 30, seconds: 3600 },
      { key: `end:address:${requestAddress(request)}`, count: 60, seconds: 3600 },
      { key: "end:global", count: 120, seconds: 3600 },
      ]);
    }); }
    finally { await release(); }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ConversationError) return Response.json({ error: error.message }, { status: error.status });
    return securityErrorResponse(error);
  }
}
