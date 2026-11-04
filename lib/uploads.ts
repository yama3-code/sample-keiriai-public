import type Anthropic from "@anthropic-ai/sdk";
import { randomId, RequestLimitError } from "@/lib/security";
import { securityCommand } from "@/lib/security-store";
import { FILE_TTL_SECONDS } from "@/lib/run-state";
import { fileExtension, GENERAL_FILE_TYPES, MAX_GENERAL_FILE_BYTES, MAX_GENERAL_FILES } from "@/lib/upload-types";

export type StagedFile = { fileId: string; name: string; filename: string; mime: string; kind: "data" | "pdf" | "image"; size: number; inputId?: string };
type Batch = { visitorId: string; files: StagedFile[]; expiresAt: number; taskId?: string };
export class UploadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
const batchKey = (id: string) => `uploads:${id}`;

export async function lockUploadBatch(id: string): Promise<() => Promise<void>> {
  const owner = randomId();
  const key = `upload-lock:${id}`;
  if (await securityCommand("lock", key, owner, 90_000) !== "OK") throw new RequestLimitError("ファイルを送信中です。少し待ってからお試しください。", 5);
  return async () => { await securityCommand("unlock", key, owner); };
}
export async function readUploadBatch(id: string, visitorId: string): Promise<Batch> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new UploadError("添付情報が正しくありません。ファイルを選び直してください。");
  const raw = await securityCommand("get", batchKey(id));
  if (typeof raw !== "string") throw new UploadError("添付ファイルの有効期限が切れたか、すでに処理に使用されています。再度送信してください。");
  const batch = JSON.parse(raw) as Batch;
  if (batch.visitorId !== visitorId || !Array.isArray(batch.files) || batch.files.length > MAX_GENERAL_FILES
    || !Number.isSafeInteger(batch.expiresAt) || batch.expiresAt <= Date.now()
    || !batch.files.every((file) => typeof file.fileId === "string" && /^file_[a-zA-Z0-9_-]+$/.test(file.fileId))) {
    throw new UploadError("このブラウザで送信した添付ファイルを確認できません。再度送信してください。");
  }
  return batch;
}
export const newUploadBatch = (visitorId: string): Batch => ({ visitorId, files: [], expiresAt: Date.now() + FILE_TTL_SECONDS * 1000 });
export async function storeUploadBatch(id: string, batch: Batch) {
  const ttl = batch.expiresAt - Date.now();
  if (ttl <= 0) throw new UploadError("添付ファイルの有効期限が切れました。");
  await securityCommand("set", batchKey(id), JSON.stringify(batch), ttl);
}
export async function claimUploadBatch(id: string, visitorId: string, validate?: (batch: Batch) => void): Promise<Batch> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new UploadError("添付情報が正しくありません。");
  const release = await lockUploadBatch(id);
  try {
    const batch = await readUploadBatch(id, visitorId);
    validate?.(batch);
    await securityCommand("take", batchKey(id));
    return batch;
  } finally { await release(); }
}

export function validateGeneralFile(file: File, bytes: ArrayBuffer) {
  const extension = fileExtension(file.name);
  const format = Object.hasOwn(GENERAL_FILE_TYPES, extension) ? GENERAL_FILE_TYPES[extension] : undefined;
  if (!format) throw new UploadError("CSV・Excel（xlsx・xls）・PDF・PNG・JPEG・WebPを選んでください。");
  if (file.size === 0) throw new UploadError(`「${file.name}」は空のファイルです。`);
  if (file.size > MAX_GENERAL_FILE_BYTES) throw new UploadError(`「${file.name}」が大きすぎます（1ファイル3MBまで）。`, 413);
  const data = new Uint8Array(bytes);
  const starts = (...header: number[]) => header.every((value, index) => data[index] === value);
  const valid = extension === "csv"
    || (extension === "xlsx" && starts(0x50, 0x4b, 0x03, 0x04))
    || (extension === "xls" && starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))
    || (extension === "pdf" && starts(0x25, 0x50, 0x44, 0x46, 0x2d))
    || (extension === "png" && starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    || ((extension === "jpg" || extension === "jpeg") && starts(0xff, 0xd8, 0xff))
    || (extension === "webp" && starts(0x52, 0x49, 0x46, 0x46) && new TextDecoder().decode(data.slice(8, 12)) === "WEBP");
  if (!valid) throw new UploadError(`「${file.name}」の拡張子とファイル形式が一致しません。`);
  const name = file.name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  return { ...format, extension, name };
}

// PDF・画像は目でも確認できるようにし、計算用の実行環境にも同じファイルを渡す。
export function attachmentBlocks(files: StagedFile[]): Anthropic.Beta.BetaContentBlockParam[] {
  return files.flatMap((file): Anthropic.Beta.BetaContentBlockParam[] => [
    { type: "container_upload", file_id: file.fileId },
    ...(file.kind === "pdf" ? [{ type: "document" as const, source: { type: "file" as const, file_id: file.fileId }, title: file.name }]
      : file.kind === "image" ? [{ type: "image" as const, source: { type: "file" as const, file_id: file.fileId } }] : []),
  ]);
}
