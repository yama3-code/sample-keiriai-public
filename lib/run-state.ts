import type Anthropic from "@anthropic-ai/sdk";
import { isEffort, type Effort } from "@/lib/models";
import { digestValue, equalSignature, randomId } from "@/lib/security";
import { securityCommand, SecurityUnavailableError } from "@/lib/security-store";

export const MAX_ROUNDS = 12;
export const MAX_QUESTIONS = 5;
export const FILE_TTL_SECONDS = 2 * 60 * 60;
const MAX_STATE_CHARS = 3_000_000;

export type RunState = {
  conversationId?: string;
  turns?: number;
  executionDeadline?: number;
  taskId: string;
  model: string;
  effort: Effort;
  allowQuestions: boolean;
  messages: Anthropic.Beta.BetaMessageParam[];
  containerId?: string;
  fileIds: string[];
  outputFileIds?: string[];
  nudged: boolean;
  questionsAsked: number;
  roundsUsed: number;
  expiresAt: number;
  configurationVersion: string;
};
type Envelope = { version: 1; sessionId: string; nonce: string; expiresAt: number; payload: string; signature: string };
const signedText = (e: Omit<Envelope, "signature">) =>
  JSON.stringify([e.version, e.sessionId, e.nonce, e.expiresAt, e.payload]);

// 履歴は変更せず、ブラウザとの結び付け・期限・改変検知情報を外側に付ける。
// 検証値は保存先にも保管し、ブラウザで再計算した値を正しいものとして扱わない。
export async function sealRunState(state: RunState, sessionId: string): Promise<string> {
  const envelope = { version: 1 as const, sessionId, nonce: randomId(), expiresAt: state.expiresAt, payload: JSON.stringify(state) };
  const signature = digestValue("run-state-v1", signedText(envelope));
  const raw = JSON.stringify({ ...envelope, signature });
  const remaining = state.expiresAt - Date.now();
  if (raw.length > MAX_STATE_CHARS || remaining <= 0) throw new Error("作業の途中経過が上限を超えました。最初から実行してください。");
  await securityCommand("set", `resume:${envelope.nonce}`, signature, remaining);
  return raw;
}

export async function readRunState(raw: string, sessionId: string): Promise<{ state: RunState; nonce: string; signature: string } | null> {
  if (raw.length > MAX_STATE_CHARS) return null;
  try {
    const e = JSON.parse(raw) as Envelope;
    if (e.version !== 1 || e.sessionId !== sessionId || typeof e.payload !== "string"
      || typeof e.nonce !== "string" || !/^[a-f0-9]{64}$/.test(e.nonce)
      || typeof e.signature !== "string" || !Number.isSafeInteger(e.expiresAt)
      || e.expiresAt <= Date.now() || e.expiresAt > Date.now() + FILE_TTL_SECONDS * 1000
      || !equalSignature(e.signature, digestValue("run-state-v1", signedText(e)))) return null;
    const s = JSON.parse(e.payload) as RunState;
    if (typeof s.taskId !== "string" || typeof s.model !== "string" || !isEffort(s.effort)
      || typeof s.allowQuestions !== "boolean" || typeof s.nudged !== "boolean"
      || !Array.isArray(s.messages) || s.messages.length === 0
      || !Array.isArray(s.fileIds) || s.fileIds.length > 20
      || !s.fileIds.every((id) => typeof id === "string" && /^file_[a-zA-Z0-9_-]+$/.test(id))
      || (s.outputFileIds !== undefined && (!Array.isArray(s.outputFileIds) || s.outputFileIds.length > 1000
        || !s.outputFileIds.every((id) => typeof id === "string" && /^file_[a-zA-Z0-9_-]+$/.test(id))))
      || (s.containerId !== undefined && typeof s.containerId !== "string")
      || !Number.isInteger(s.questionsAsked) || s.questionsAsked < 1 || s.questionsAsked > MAX_QUESTIONS
      || !Number.isInteger(s.roundsUsed) || s.roundsUsed < 1 || s.roundsUsed >= MAX_ROUNDS
      || typeof s.configurationVersion !== "string"
      || s.expiresAt !== e.expiresAt) return null;
    if (await securityCommand("get", `resume:${e.nonce}`) !== e.signature) return null;
    return { state: s, nonce: e.nonce, signature: e.signature };
  } catch (error) {
    if (error instanceof SecurityUnavailableError) throw error;
    return null;
  }
}

// 同じ回答を同時に送信・再送しても、Claudeを重複して呼び出さない。
export async function consumeRunState(nonce: string, signature: string): Promise<boolean> {
  return await securityCommand("take", `resume:${nonce}`) === signature;
}
