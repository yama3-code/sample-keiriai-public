import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { digestValue, randomId } from "@/lib/security";
import { securityCommand } from "@/lib/security-store";
import type { RunState } from "@/lib/run-state";

export const MAX_CONVERSATION_TURNS = 6;
export const MAX_CONVERSATION_MESSAGES = 100;
export const MAX_CONVERSATION_BYTES = 1_000_000;
export const TURN_DURATION_MS = 5 * 60 * 1000;
export type Continuation = { ticket: string; id: string; expiresAt: number; turn: number };
type RecordValue = { owner: string; key: string; fileIds: string[]; expiresAt: number; ticket: string | null; phase: "result" | "question" };
type Envelope = { conversation: string; iv: string; data: string; tag: string };
export type ConversationTicket = { state: RunState; raw: string; phase: RecordValue["phase"] };
export class ConversationError extends Error {
  constructor(message = "会話の期限切れ・変更・送信済みを確認しました。「新しい依頼」から始めてください。", public status = 409) { super(message); }
}
const recordKey = (id: string) => `conversation:${id}`;
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id);
async function readRecord(id: string, owner: string): Promise<RecordValue> {
  if (!validId(id)) throw new ConversationError();
  const raw = await securityCommand("get", recordKey(id));
  if (typeof raw !== "string") throw new ConversationError();
  const record = JSON.parse(raw) as RecordValue;
  if (record.owner !== owner || record.expiresAt <= Date.now()) throw new ConversationError();
  return record;
}
async function store(id: string, record: RecordValue) {
  const ttl = record.expiresAt - Date.now();
  if (ttl <= 0) throw new ConversationError();
  await securityCommand("set", recordKey(id), JSON.stringify(record), ttl);
}
export function checkConversationSize(state: RunState) {
  if (state.messages.length > MAX_CONVERSATION_MESSAGES || Buffer.byteLength(JSON.stringify(state), "utf8") > MAX_CONVERSATION_BYTES) {
    throw new ConversationError("会話の履歴量が上限（100発言・1MB）に達しました。「新しい依頼」から始めてください。");
  }
}
// 履歴は暗号化してブラウザへ返す。サーバーには履歴も元資料の本文も保存しない。
export async function sealConversation(state: RunState, owner: string, phase: RecordValue["phase"]): Promise<Continuation> {
  checkConversationSize(state);
  state.conversationId ??= randomId();
  const id = state.conversationId;
  const existing = await securityCommand("get", recordKey(id));
  const record: RecordValue = typeof existing === "string" ? await readRecord(id, owner) : {
    owner, key: randomBytes(32).toString("base64"), fileIds: [...new Set([...state.fileIds, ...(state.outputFileIds ?? [])])], expiresAt: state.expiresAt, ticket: null, phase,
  };
  record.expiresAt = Math.min(record.expiresAt, state.expiresAt);
  record.fileIds = [...new Set([...state.fileIds, ...(state.outputFileIds ?? [])])]; record.phase = phase;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(record.key, "base64"), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(state), "utf8"), cipher.final()]);
  const ticket = JSON.stringify({ conversation: id, iv: iv.toString("base64"), data: data.toString("base64"), tag: cipher.getAuthTag().toString("base64") });
  record.ticket = digestValue("conversation-ticket", ticket);
  await store(id, record);
  return { id, ticket, expiresAt: state.expiresAt, turn: state.turns ?? 1 };
}
export async function readConversation(raw: string, owner: string, phase: RecordValue["phase"]): Promise<ConversationTicket> {
  if (raw.length > 1_500_000) throw new ConversationError("会話が大きすぎます。「新しい依頼」から始めてください。", 413);
  let envelope: Envelope;
  try { envelope = JSON.parse(raw); } catch { throw new ConversationError(); }
  if (!envelope || typeof envelope.conversation !== "string") throw new ConversationError();
  const record = await readRecord(envelope.conversation, owner);
  if (record.phase !== phase || record.ticket !== digestValue("conversation-ticket", raw)) throw new ConversationError();
  let state: RunState;
  try {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(record.key, "base64"), Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString("utf8"));
  } catch { throw new ConversationError(); }
  if (state.conversationId !== envelope.conversation || state.expiresAt > record.expiresAt || state.expiresAt <= Date.now()) throw new ConversationError();
  checkConversationSize(state);
  return { state, raw, phase };
}
// 呼出し元はブラウザ単位の実行枠を取ってから消費する。二重送信も同じ枠で直列化する。
export async function consumeConversation(ticket: ConversationTicket, owner: string) {
  const record = await readRecord(ticket.state.conversationId!, owner);
  if (record.ticket !== digestValue("conversation-ticket", ticket.raw)) throw new ConversationError();
  record.ticket = null;
  await store(ticket.state.conversationId!, record);
}
export async function closeConversation(id: string, owner: string, client: Anthropic, beforeClose?: () => Promise<void>) {
  const record = await readRecord(id, owner);
  await beforeClose?.();
  // 先に無効化し、削除失敗時も再利用できないようにする。2時間の自動期限は元添付だけにある。
  await securityCommand("remove", recordKey(id));
  await Promise.allSettled(record.fileIds.map((file) => client.files.delete(file, {}, { signal: AbortSignal.timeout(5000) })));
}
export async function checkConversationFiles(state: RunState, client: Anthropic) {
  try {
    for (const fileId of state.fileIds) {
      const file = await client.files.retrieveMetadata(fileId, {}, { signal: AbortSignal.timeout(5000) });
      if (file.expires_at) {
        const expiry = Date.parse(file.expires_at);
        if (!Number.isFinite(expiry)) throw new Error();
        state.expiresAt = Math.min(state.expiresAt, expiry);
      }
    }
    if (state.expiresAt <= Date.now()) throw new Error();
  } catch { throw new ConversationError("元の資料を利用できません。前の結果だけでは継続せず、「新しい依頼」から資料を送信してください。"); }
}

export async function invalidateConversation(id: string, owner: string) {
  await readRecord(id, owner);
  await securityCommand("remove", recordKey(id));
}
