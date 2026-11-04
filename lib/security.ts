import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { securityCommand } from "@/lib/security-store";

export const randomId = () => randomBytes(32).toString("hex");
export const digestValue = (purpose: string, value: string) => createHash("sha256").update(`${purpose}\0${value}`).digest("hex");
export function equalSignature(a: string, b: string): boolean {
  return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b)
    && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
export class RequestLimitError extends Error {
  constructor(message: string, public readonly retryAfter: number) { super(message); }
}
export async function limitRequests(key: string, count: number, seconds: number) {
  const retry = await securityCommand("limit", `limit:${key}`, String(count), seconds * 1000);
  if (typeof retry !== "number" || !Number.isSafeInteger(retry) || retry < 0) throw new Error("回数制限を確認できません");
  if (retry > 0) throw new RequestLimitError("実行回数の上限に達しました。時間をおいて再度お試しください。", retry);
}
export type RequestBudget = { key: string; count: number; seconds: number };
// 全条件を一度に確認し、許可した送信だけを全体・接続元・ブラウザの各枠へ計上する。
export async function limitTogether(scope: "traffic" | "accepted", rules: RequestBudget[], message?: string) {
  if (!rules.length || rules.length > 12 || !rules.every((rule) => /^[a-zA-Z0-9:_-]{1,240}$/.test(rule.key)
    && Number.isSafeInteger(rule.count) && rule.count > 0 && Number.isSafeInteger(rule.seconds) && rule.seconds > 0 && rule.seconds <= 86400)
    || new Set(rules.map((rule) => rule.key)).size !== rules.length) throw new Error("回数制限の設定が不正です");
  const value = rules.map(({ key, count, seconds }) => ({ key, count, milliseconds: seconds * 1000 }));
  const retry = await securityCommand("limits", `budgets:${scope}`, JSON.stringify(value));
  if (typeof retry !== "number" || !Number.isSafeInteger(retry) || retry < 0) throw new Error("回数制限を確認できません");
  if (retry > 0) throw new RequestLimitError(message ?? "実行回数の上限に達しました。時間をおいて再度お試しください。", retry);
}
export async function limitRequestTraffic(request: Request, kind: "run" | "uploads" | "settings" | "recovery" | "end", address = requestAddress(request)) {
  const perAddress = { run: 30, uploads: 90, settings: 30, recovery: 30, end: 60 }[kind];
  await limitTogether("traffic", [
    { key: `${kind}:address:${address}`, count: perAddress, seconds: 60 },
    { key: `${kind}:global`, count: perAddress * 10, seconds: 60 },
  ], "送信が集中しています。1分ほど待ってからお試しください。");
}
// 信頼できない転送ヘッダーは使わず、IPを書き換えられても全体の制限は維持する。
export function requestAddress(request: Request): string {
  const address = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
  return digestValue("request-address", address);
}
export async function acquireRunLease(sessionId: string): Promise<() => Promise<void>> {
  const owner = randomId();
  const sessionKey = `active:session:${sessionId}`;
  if (await securityCommand("lock", sessionKey, owner, 360_000) !== "OK") {
    throw new RequestLimitError("別の作業が実行中です。終了してからお試しください。", 10);
  }
  try {
    for (let i = 0; i < 2; i++) {
      const key = `active:global:${i}`;
      if (await securityCommand("lock", key, owner, 360_000) === "OK") {
        return async () => {
          await securityCommand("unlock", key, owner);
          await securityCommand("unlock", sessionKey, owner);
        };
      }
    }
    throw new RequestLimitError("現在ほかの作業を実行しています。少し待ってお試しください。", 10);
  } catch (error) {
    await securityCommand("unlock", sessionKey, owner);
    throw error;
  }
}
export function securityErrorResponse(error: unknown): Response {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return Response.json({ error: "送信を中止しました。必要な場合は改めて実行してください。" }, { status: 408 });
  }
  if (error instanceof PayloadTooLargeError) {
    return Response.json({ error: "送信データが大きすぎます。ファイルを小さくしてお試しください。" }, { status: 413 });
  }
  if (error instanceof RequestLimitError) {
    return Response.json({ error: error.message }, {
      status: 429, headers: { "Retry-After": String(error.retryAfter), "Cache-Control": "no-store" },
    });
  }
  return Response.json({ error: "安全確認用の保存先を利用できません。管理者に設定を確認してください。" }, {
    status: 503, headers: { "Cache-Control": "no-store" },
  });
}
// ほかのサイトから、意図しない業務実行や編集保存を送信させない。
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return request.headers.get("sec-fetch-site") !== "cross-site"
    && (!origin || origin === new URL(request.url).origin);
}

class PayloadTooLargeError extends Error {}
export async function readLimitedBody(request: Request, maximum: number): Promise<ArrayBuffer> {
  if (Number(request.headers.get("content-length")) > maximum) throw new PayloadTooLargeError();
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maximum) {
          await reader.cancel();
          throw new PayloadTooLargeError();
        }
        chunks.push(value);
      }
    }
  } finally { reader?.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes.buffer;
}
