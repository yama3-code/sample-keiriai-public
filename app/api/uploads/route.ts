import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { createClaudeClient } from "@/lib/claude-client";
import { FILE_TTL_SECONDS } from "@/lib/run-state";
import { isSameOrigin, limitRequestTraffic, limitTogether, randomId, readLimitedBody, requestAddress, securityErrorResponse } from "@/lib/security";
import { rememberVisitor, visitorForRequest } from "@/lib/visitors";
import { MAX_GENERAL_FILES, MAX_GENERAL_FILE_BYTES, MAX_TASK_FILES, MAX_TASK_FILE_BYTES } from "@/lib/upload-types";
import { lockUploadBatch, newUploadBatch, readUploadBatch, storeUploadBatch, UploadError, validateGeneralFile } from "@/lib/uploads";

import { loadConfiguration } from "@/lib/configuration";

export const maxDuration = 60;
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "送信元を確認できません" }, { status: 403 });
  const visitor = visitorForRequest(request);
  let release: (() => Promise<void>) | undefined;
  let uploadedId: string | undefined;
  let client: Anthropic | undefined;
  try {
    await limitRequestTraffic(request, "uploads", requestAddress(request));
    request.signal.throwIfAborted();
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: "Claude APIキーが設定されていません" }, { status: 500 });
    const bytes = await readLimitedBody(request, MAX_GENERAL_FILE_BYTES + 64 * 1024);
    const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData().catch(() => null);
    const files = form ? [...form.values()].filter((value) => value instanceof File) : [];
    if (!form || files.length !== 1 || !(form.get("file") instanceof File)) throw new UploadError("ファイルは1個ずつ送信してください。");
    const file = form.get("file") as File;
    const taskId = String(form.get("taskId") || "");
    const inputId = String(form.get("inputId") || "");
    if (taskId) {
      const task = (await loadConfiguration()).tasks.find((item) => item.id === taskId && item.mode !== "general");
      if (!task || !task.inputs.some((input) => input.id === inputId)) throw new UploadError("業務または入力データの種類が正しくありません。");
      if (!file.name.toLowerCase().endsWith(".csv") || file.size > MAX_TASK_FILE_BYTES) throw new UploadError("定型業務では1ファイル1MBまでのCSVを選んでください。");
    } else if (inputId) throw new UploadError("業務を指定してください。");
    const raw = await file.arrayBuffer();
    const format = validateGeneralFile(file, raw);
    const requestedBatch = form.get("batchId");
    const id = typeof requestedBatch === "string" && requestedBatch ? requestedBatch : randomId();
    if (!/^[a-f0-9]{64}$/.test(id)) throw new UploadError("添付情報が正しくありません。");
    release = await lockUploadBatch(id);
    const batch = requestedBatch ? await readUploadBatch(id, visitor.id) : newUploadBatch(visitor.id);
    if ((batch.taskId || "") !== taskId && requestedBatch) throw new UploadError("別の業務の添付情報は使用できません。");
    if (taskId) batch.taskId = taskId;
    const maximum = taskId ? MAX_TASK_FILES : MAX_GENERAL_FILES;
    if (batch.files.length >= maximum) throw new UploadError(`添付できるファイルは${maximum}個までです。`);
    const filename = `input_${String(batch.files.length + 1).padStart(2, "0")}.${format.extension}`;
    let content = Buffer.from(raw);
    if (format.extension === "csv") {
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(raw); }
      catch { text = new TextDecoder("shift_jis").decode(raw); }
      content = Buffer.from(text.replace(/^\uFEFF/, ""), "utf8");
    }
    request.signal.throwIfAborted();
    await limitTogether("accepted", [
      { key: `uploads:visitor:${visitor.id}`, count: 75, seconds: 3600 },
      { key: `uploads:address:${requestAddress(request)}`, count: 75, seconds: 3600 },
      { key: "uploads:global", count: 150, seconds: 3600 },
      { key: "uploads:daily", count: 450, seconds: 86400 },
    ]);
    client = createClaudeClient();
    const uploaded = await client.files.upload({ file: await toFile(content, filename, { type: format.mime }), expires_in_seconds: FILE_TTL_SECONDS }, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]) });
    uploadedId = uploaded.id;
    batch.files.push({ fileId: uploaded.id, name: format.name, filename, mime: format.mime, kind: format.kind, size: file.size, ...(inputId ? { inputId } : {}) });
    await storeUploadBatch(id, batch);
    uploadedId = undefined;
    return rememberVisitor(Response.json({ batchId: id, count: batch.files.length }, { headers: { "Cache-Control": "no-store" } }), visitor);
  } catch (error) {
    if (uploadedId && client) await client.files.delete(uploadedId, {}, { signal: AbortSignal.timeout(5000) }).catch(() => {});
    if (error instanceof UploadError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof Anthropic.AuthenticationError) return Response.json({ error: "Claude APIキーの設定を確認してください" }, { status: 500 });
    if (error instanceof Anthropic.RateLimitError) return Response.json({ error: "ファイルの送信が混み合っています。少し待ってお試しください。" }, { status: 429 });
    if (error instanceof Anthropic.BadRequestError) return Response.json({ error: "ファイルを送信できませんでした。形式や内容を確認してください。" }, { status: 400 });
    if (request.signal.aborted || (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))) return Response.json({ error: "ファイルの送信を中止しました。再度お試しください。" }, { status: 408 });
    return securityErrorResponse(error);
  } finally { if (release) await release().catch(() => {}); }
}
