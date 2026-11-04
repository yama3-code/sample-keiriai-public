import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Operation } from "@/lib/security-store";

type RecordValue = { value: string; expiresAt: number };
type Records = Record<string, RecordValue>;

// この保存処理は開発時のみ読み込み、公開用のコードには含めない。
export async function localCommand(op: Operation, key: string, value: string, ttl: number): Promise<unknown> {
  const dir = process.env.SECURITY_LOCAL_DIR || path.join(process.cwd(), ".local");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, "security.lock");
  let acquired = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  if (!acquired) throw new Error("安全確認用のファイルを利用できません");
  const file = path.join(dir, "security.json");
  const temporary = path.join(dir, `security-${randomBytes(12).toString("hex")}.tmp`);
  try {
    let records: Records = {};
    try {
      records = JSON.parse(fs.readFileSync(file, "utf8")) as Records;
    } catch (error) {
      // 壊れた保存内容を空として扱うと、回数制限をリセットしてしまうため停止する。
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    // 形式が壊れた保存内容を空扱いせず、回数制限・編集内容を保護する。
    if (typeof records !== "object" || records === null || Array.isArray(records)
      || !Object.values(records).every((record) => record && typeof record === "object"
        && typeof record.value === "string" && Number.isSafeInteger(record.expiresAt) && record.expiresAt >= 0)) {
      throw new Error("安全確認用の保存内容が不正です");
    }
    const now = Date.now();
    for (const [name, record] of Object.entries(records)) {
      if (record.expiresAt !== 0 && record.expiresAt <= now) delete records[name];
    }
    const current = records[key];
    let result: unknown = null;
    if (op === "limits") {
      const rules = JSON.parse(value) as { key: string; count: number; milliseconds: number }[];
      const counters = current ? JSON.parse(current.value) as Record<string, { count: number; expiresAt: number }> : {};
      if (typeof counters !== "object" || counters === null || Array.isArray(counters)
        || !Object.values(counters).every((counter) => counter && typeof counter === "object"
          && Number.isSafeInteger(counter.count) && counter.count >= 0 && Number.isSafeInteger(counter.expiresAt) && counter.expiresAt > 0)) {
        throw new Error("回数制限の記録が不正です");
      }
      Object.setPrototypeOf(counters, null);
      for (const [name, counter] of Object.entries(counters)) if (counter.expiresAt <= now) delete counters[name];
      const retry = rules.reduce((seconds, rule) => {
        const counter = counters[rule.key];
        return counter && counter.count >= rule.count ? Math.max(seconds, Math.max(1, Math.ceil((counter.expiresAt - now) / 1000))) : seconds;
      }, 0);
      result = retry;
      // どれか1つの枠で拒否された場合、ほかの利用者と共有する枠は消費しない。
      if (!retry) {
        for (const rule of rules) {
          const counter = counters[rule.key] ?? { count: 0, expiresAt: now + rule.milliseconds };
          counter.count++;
          counters[rule.key] = counter;
        }
        records[key] = { value: JSON.stringify(counters), expiresAt: Math.max(...Object.values(counters).map((counter) => counter.expiresAt)) };
      }
    } else if (op === "cas") {
      const update = JSON.parse(value) as { expected: string; value: string };
      result = 0;
      if ((current?.value ?? "") === update.expected) {
        records[key] = { value: update.value, expiresAt: 0 };
        result = 1;
      }
    } else if (op === "get" || op === "take") {
      result = current?.value ?? null;
      if (op === "take") delete records[key];
    } else if (op === "set" || (op === "lock" && !current)) {
      records[key] = { value, expiresAt: now + ttl };
      result = "OK";
    } else if (op === "remove" || (op === "unlock" && current?.value === value)) {
      delete records[key];
      result = 1;
    } else if (op === "limit") {
      if (current && (!/^\d+$/.test(current.value) || !Number.isSafeInteger(Number(current.value)))) {
        throw new Error("回数制限の記録が不正です");
      }
      if (current && Number(current.value) >= Number(value)) {
        result = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
      } else {
        records[key] = { value: String(Number(current?.value ?? 0) + 1), expiresAt: current?.expiresAt ?? now + ttl };
        result = 0;
      }
    }
    fs.writeFileSync(temporary, JSON.stringify(records), { mode: 0o600 });
    fs.renameSync(temporary, file);
    return result;
  } finally {
    fs.rmSync(temporary, { force: true });
    fs.rmdirSync(lock);
  }
}
