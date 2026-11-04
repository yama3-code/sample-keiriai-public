import { createHash } from "node:crypto";

// 手元ではファイル、公開環境では共有Redisに安全確認用の情報を保存する。
export class SecurityUnavailableError extends Error {
  constructor() { super("安全確認用の保存先を利用できません。管理者に設定を確認してください。"); }
}
export type Operation = "get" | "set" | "take" | "remove" | "limit" | "limits" | "lock" | "unlock" | "cas";

// 読み取りと更新を一括で行い、同時送信でも回数や再開券を二重に使わせない。
const SCRIPT = `
local op, value, ttl = ARGV[1], ARGV[2], tonumber(ARGV[3])
local current = redis.call('GET', KEYS[1])
if op == 'limits' then
  local rules = cjson.decode(value)
  local counters = {}
  if current then
    if not string.match(current, '^%s*{') then return redis.error_reply('invalid counters') end
    counters = cjson.decode(current)
  end
  local clock = redis.call('TIME')
  local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
  for name, counter in pairs(counters) do
    if type(counter) ~= 'table' or type(counter.count) ~= 'number' or counter.count < 0 or counter.count > 9007199254740991 or counter.count ~= math.floor(counter.count)
      or type(counter.expiresAt) ~= 'number' or counter.expiresAt <= 0 or counter.expiresAt > 9007199254740991 or counter.expiresAt ~= math.floor(counter.expiresAt) then
      return redis.error_reply('invalid counter')
    end
    if counter.expiresAt <= now then counters[name] = nil end
  end
  local retry = 0
  for _, rule in ipairs(rules) do
    local counter = counters[rule.key]
    if counter and counter.count >= rule.count then
      retry = math.max(retry, math.max(1, math.ceil((counter.expiresAt - now) / 1000)))
    end
  end
  if retry > 0 then return retry end
  for _, rule in ipairs(rules) do
    local counter = counters[rule.key]
    if not counter then counter = { count = 0, expiresAt = now + rule.milliseconds } end
    counter.count = counter.count + 1
    counters[rule.key] = counter
  end
  local expiry = now + 1
  for _, counter in pairs(counters) do expiry = math.max(expiry, counter.expiresAt) end
  redis.call('SET', KEYS[1], cjson.encode(counters), 'PX', expiry - now)
  return 0
end
if op == 'get' then return current end
if op == 'cas' then
  local update = cjson.decode(value)
  if (current or '') ~= update.expected then return 0 end
  redis.call('SET', KEYS[1], update.value)
  return 1
end
if op == 'set' then return redis.call('SET', KEYS[1], value, 'PX', ttl) end
if op == 'remove' then return redis.call('DEL', KEYS[1]) end
if op == 'take' then
  if current then redis.call('DEL', KEYS[1]) end
  return current
end
if op == 'unlock' then
  if current == value then return redis.call('DEL', KEYS[1]) end
  return 0
end
if op == 'lock' then return redis.call('SET', KEYS[1], value, 'NX', 'PX', ttl) end
if op == 'limit' then
  if current and tonumber(current) >= tonumber(value) then
    return math.max(1, math.ceil(redis.call('PTTL', KEYS[1]) / 1000))
  end
  local count = redis.call('INCR', KEYS[1])
  if count == 1 then redis.call('PEXPIRE', KEYS[1], ttl) end
  return 0
end
return redis.error_reply('unsupported operation')
`;


export async function securityCommand(op: Operation, key: string, value = "", ttl = 1): Promise<unknown> {
  try {
    const namespace = createHash("sha256")
      .update(process.env.SECURITY_STORE_PREFIX || "keiri").digest("hex").slice(0, 32);
    const storeKey = `keiri-public-v1:${namespace}:${key}`;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url || token) {
      if (!url || !token || new URL(url).protocol !== "https:") throw new SecurityUnavailableError();
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(["EVAL", SCRIPT, "1", storeKey, op, value, String(ttl)]),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new SecurityUnavailableError();
      const body = await response.json() as { result?: unknown; error?: string };
      if (body.error || !("result" in body)) throw new SecurityUnavailableError();
      return body.result;
    }
    // サーバーごとに別の制限値を持つ状態へ自動的に戻さない。
    if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
      const { localCommand } = await import("@/lib/security-store-local");
      return await localCommand(op, storeKey, value, ttl);
    }
    throw new SecurityUnavailableError();
  } catch {
    // 接続先や認証情報を含む内部エラーを画面・ログへ流さない。
    throw new SecurityUnavailableError();
  }
}
