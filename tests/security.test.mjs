import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// 実際の環境設定は読み込まず、外部APIをすべて置き換えて安全対策を確認する。
const require = createRequire(import.meta.url);
const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keiri-security-test-"));
let cache;
let calls;
let deletions;
let replies;
let uploads;
let uploadCalls;
let missingFiles;
let streamEvents;
let deleteFailures;
let clientOptions;
class MockAnthropic {
  constructor(options) {
    clientOptions.push(options);
    this.files = {
      upload: async (options, requestOptions) => { uploadCalls.push({ options, requestOptions }); return { id: `file_mock_${++uploads}` }; },
      retrieveMetadata: async (id) => { if (missingFiles.has(id)) throw new MockAnthropic.NotFoundError(); return { id, expires_at: new Date(Date.now() + 7200000).toISOString() }; },
      delete: async (id) => { deletions.push(id); if (deleteFailures.has(id)) throw new Error("模擬的な削除失敗"); },
    };
    this.beta = { messages: { stream: (options, requestOptions) => {
      calls.push({ options: structuredClone(options), requestOptions });
      const reply = replies.shift();
      assert.ok(reply, "想定外のClaude呼び出しを行わない");
      return { async *[Symbol.asyncIterator]() { while (streamEvents.length) { const event = streamEvents.shift(); if (event instanceof Error) throw event; yield event; } }, finalMessage: async () => { if (reply instanceof Error) throw reply; if (reply.container && !reply.container.expires_at) reply.container.expires_at = new Date(Date.now() + 7200000).toISOString(); return reply; } };
    } } };
  }
}
for (const name of ["AuthenticationError", "NotFoundError", "RateLimitError", "BadRequestError"]) {
  MockAnthropic[name] = class extends Error {};
}
function load(relative) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = (name) => {
    if (name === "server-only") return {};
    if (name === "@anthropic-ai/sdk") return { __esModule: true, default: MockAnthropic, toFile: async (bytes, name, options) => new File([bytes], name, options) };
    if (name === "react-markdown") return { __esModule: true, default: ReactMarkdown };
    if (name === "remark-gfm") return { __esModule: true, default: remarkGfm };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!resolved) throw new Error(`依存ファイルが見つかりません：${name}`);
      return load(path.relative(root, resolved));
    }
    return require(name);
  };
  new Function("require", "module", "exports", "__dirname", "__filename", output)(localRequire, loadedModule, loadedModule.exports, path.dirname(file), file);
  return loadedModule.exports;
}
beforeEach(() => {
  delete process.env.APP_PASSWORD;
  process.env.ANTHROPIC_API_KEY = "dummy-never-sent";
  process.env.NODE_ENV = "test";
  process.env.SECURITY_LOCAL_DIR = fs.mkdtempSync(path.join(temp, "store-"));
  delete process.env.VERCEL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.SECURITY_STORE;
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_LOG;
  for (const key of Object.keys(process.env)) if (key.startsWith("PUBLIC_")) delete process.env[key];
  cache = new Map(); calls = []; deletions = []; replies = []; uploads = 0; uploadCalls = []; missingFiles = new Set();
  streamEvents = []; deleteFailures = new Set();
  clientOptions = [];
});
after(() => fs.rmSync(temp, { recursive: true, force: true }));

function request(url, token, body, extraHeaders = {}) {
  return new Request(`http://localhost${url}`, {
    method: "POST", headers: { ...(token ? { cookie: `keiri_visitor=${token}` } : {}), ...extraHeaders }, body,
  });
}
function runForm(resume) {
  const form = new FormData();
  if (resume) { form.set("resume", resume); form.set("answers", JSON.stringify({ toolu_question: "要確認にしてください" })); }
  else { form.set("taskId", "01-pc-allocation"); form.set("model", "claude-haiku-5-5"); form.set("effort", "low"); }
  return form;
}
const result = { summary: "模擬結果", steps: [], entries: [], issues: [] };
const submitted = () => ({ content: [{ type: "tool_use", name: "submit_result", id: "toolu_result", input: result }], stop_reason: "tool_use" });
const asked = () => ({ content: [{ type: "tool_use", name: "ask_user", id: "toolu_question", input: { question: "架空の確認", options: [] } }], stop_reason: "tool_use", container: { id: "container_mock" } });
async function events(response) { return (await response.text()).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
function state() {
  return { taskId: "01-pc-allocation", model: "claude-haiku-5-5", effort: "low", allowQuestions: true,
    messages: [{ role: "assistant", content: asked().content }], containerId: "container_mock", fileIds: ["file_mock"],
    nudged: false, questionsAsked: 1, roundsUsed: 1, expiresAt: Date.now() + 60_000, configurationVersion: "mock-version" };
}

test("Claudeの鍵はサーバー専用の接続だけへ渡し、接続先の差し替えと詳細ログを防ぐ", () => {
  process.env.ANTHROPIC_BASE_URL = "https://other.example.invalid";
  process.env.ANTHROPIC_AUTH_TOKEN = "dummy-unwanted-token";
  process.env.ANTHROPIC_LOG = "debug";
  const { createClaudeClient } = load("lib/claude-client.ts");
  createClaudeClient();
  assert.deepEqual(clientOptions, [{ apiKey: "dummy-never-sent", authToken: null,
    baseURL: "https://api.anthropic.com", logLevel: "off", dangerouslyAllowBrowser: false }]);
  delete process.env.ANTHROPIC_API_KEY;
  assert.throws(createClaudeClient, /APIキーが設定されていません/);
  assert.equal(clientOptions.length, 1);
});

test("Claudeの生のエラーに認証情報が含まれても画面へ流さない", async () => {
  const run = load("app/api/run/route.ts");
  const marker = "dummy-sensitive-error-content";
  replies.push(new MockAnthropic.AuthenticationError(marker));
  const response = await run.POST(request("/api/run", null, runForm()));
  const output = await response.text();
  assert.equal(output.includes(marker), false);
  assert.match(output, /APIキー/);
});

test("ログインを要求せず、ブラウザの識別情報だけを発行する", () => {
  const { visitorForRequest, rememberVisitor } = load("lib/visitors.ts");
  const first = visitorForRequest(request("/api/run", null));
  const next = visitorForRequest(request("/api/run", first.token));
  assert.equal(first.isNew, true);
  assert.equal(next.id, first.id);
  assert.equal(next.isNew, false);
  assert.notEqual(visitorForRequest(request("/api/run", null)).id, first.id);
  const response = rememberVisitor(Response.json({ ok: true }), first);
  assert.match(response.headers.get("set-cookie"), /keiri_visitor=.*HttpOnly/);
});

test("再開情報の改変・検証値の作り直し・別ブラウザ・期限切れを拒否し、再送は一度だけ許可する", async () => {
  const api = load("lib/run-state.ts");
  const raw = await api.sealRunState(state(), "session-a");
  const ticket = await api.readRunState(raw, "session-a");
  assert.deepEqual(ticket.state.messages, state().messages);
  assert.equal(await api.readRunState(raw, "session-b"), null);
  const changed = JSON.parse(raw);
  const payload = JSON.parse(changed.payload);
  payload.fileIds = ["file_other_run"];
  payload.containerId = "container_other_run";
  changed.payload = JSON.stringify(payload);
  assert.equal(await api.readRunState(JSON.stringify(changed), "session-a"), null);
  const { digestValue } = load("lib/security.ts");
  changed.signature = digestValue("run-state-v1", JSON.stringify([changed.version, changed.sessionId, changed.nonce, changed.expiresAt, changed.payload]));
  assert.equal(await api.readRunState(JSON.stringify(changed), "session-a"), null);
  const consumed = await Promise.all([api.consumeRunState(ticket.nonce, ticket.signature), api.consumeRunState(ticket.nonce, ticket.signature)]);
  assert.equal(consumed.filter(Boolean).length, 1);
  assert.equal(await api.readRunState(raw, "session-a"), null);
  const expiring = await api.sealRunState(state(), "session-a");
  const now = Date.now;
  try { Date.now = () => now() + 120_000; assert.equal(await api.readRunState(expiring, "session-a"), null); }
  finally { Date.now = now; }
});

test("業務開始→質問→回答→結果が模擬APIで完了し、不正な再開ではClaudeも削除処理も呼ばない", async () => {
  const token = load("lib/security.ts").randomId();
  const run = load("app/api/run/route.ts");
  replies.push(asked());
  const first = await events(await run.POST(request("/api/run", token, runForm())));
  const question = first.find((e) => e.type === "question");
  assert.ok(question);
  assert.equal(deletions.length, 0);
  const changed = JSON.parse(question.state);
  changed.payload = changed.payload.replace("file_mock_1", "file_other_run");
  assert.equal((await run.POST(request("/api/run", token, runForm(JSON.stringify(changed))))).status, 400);
  assert.equal(calls.length, 1);
  assert.equal(deletions.length, 0);
  const other = load("lib/security.ts").randomId();
  assert.equal((await run.POST(request("/api/run", other, runForm(question.state)))).status, 400);
  replies.push(submitted());
  const second = await events(await run.POST(request("/api/run", token, runForm(question.state))));
  assert.ok(second.some((e) => e.type === "result"));
  assert.equal(calls[1].options.container, "container_mock");
  assert.deepEqual(calls[1].options.messages[1].content, asked().content);
  assert.equal(calls[1].requestOptions.signal instanceof AbortSignal, true);
  assert.deepEqual(deletions.sort(), ["file_mock_1", "file_mock_2"]);
  assert.equal((await run.POST(request("/api/run", token, runForm(question.state)))).status, 400);
  assert.equal(calls.length, 2);
});

test("実行枠は1ブラウザ1件・全体2件で、解放後には再実行できる", async () => {
  const { acquireRunLease } = load("lib/security.ts");
  const releaseA = await acquireRunLease("session-a");
  await assert.rejects(acquireRunLease("session-a"), { retryAfter: 10 });
  const releaseB = await acquireRunLease("session-b");
  await assert.rejects(acquireRunLease("session-c"), { retryAfter: 10 });
  await releaseA();
  const releaseC = await acquireRunLease("session-c");
  await releaseB(); await releaseC();
});

test("回数制限は並列送信とモジュールの再読み込みでも維持され、時間経過で解除する", async () => {
  const security = load("lib/security.ts");
  const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => security.limitRequests("test", 5, 60)));
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 5);
  cache = new Map();
  await assert.rejects(load("lib/security.ts").limitRequests("test", 5, 60));
  const now = Date.now;
  try { Date.now = () => now() + 61_000; await security.limitRequests("test", 5, 60); }
  finally { Date.now = now; }
});

test("公開用保存先が未設定・停止中の場合は、保存や実行の制限を無効化せず停止する", async () => {
  process.env.VERCEL = "1";
  const settings = load("app/api/settings/route.ts");
  assert.equal((await settings.GET()).status, 503);
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "dummy-not-sent";
  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("模擬的な接続停止"); };
    assert.equal((await settings.GET()).status, 503);
  } finally { globalThis.fetch = realFetch; }
});

test("ログインなしで業務を実行でき、別サイトからの送信は拒否する", async () => {
  const run = load("app/api/run/route.ts");
  replies.push(submitted());
  const response = await run.POST(request("/api/run", null, runForm()));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie"), /keiri_visitor=/);
  assert.ok((await events(response)).some((event) => event.type === "result"));
  assert.equal((await run.POST(request("/api/run", null, runForm(), { origin: "https://other.example.invalid" }))).status, 403);
  assert.equal(calls.length, 1);
});

test("不正な送信は短時間だけ接続元を制限し、全員の業務枠を1時間使い切らせない", async () => {
  const run = load("app/api/run/route.ts");
  for (let i = 0; i < 60; i++) {
    const token = load("lib/security.ts").randomId();
    const invalid = new FormData(); invalid.set("taskId", "存在しない架空業務");
    assert.equal((await run.POST(request("/api/run", token, invalid))).status, i < 30 ? 400 : 429);
  }
  const token = load("lib/security.ts").randomId();
  const blocked = await run.POST(request("/api/run", token, runForm()));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) <= 60);
  assert.equal(calls.length, 0);
  const now = Date.now;
  try {
    Date.now = () => now() + 61_000;
    replies.push(submitted());
    assert.ok((await events(await run.POST(request("/api/run", token, runForm())))).some((event) => event.type === "result"));
  } finally { Date.now = now; }
});

test("新規業務は1ブラウザ毎時5件で止まり、追加のAPI料金が発生する処理へ進まない", async () => {
  const token = load("lib/security.ts").randomId();
  const run = load("app/api/run/route.ts");
  for (let i = 0; i < 5; i++) {
    replies.push(submitted());
    assert.ok((await events(await run.POST(request("/api/run", token, runForm())))).some((e) => e.type === "result"));
  }
  assert.equal((await run.POST(request("/api/run", token, runForm()))).status, 429);
  assert.equal(calls.length, 5);
  assert.equal(uploads, 10);
});

test("数式を含む仕訳は業務APIからも結果・CSVとして送信しない", async () => {
  const token = load("lib/security.ts").randomId();
  const run = load("app/api/run/route.ts");
  const reply = submitted();
  reply.content[0].input = { ...result, entries: [{ voucher_no: "TR-TEST", date: "2025-12-31", debit_code: "6140", debit_account: "旅費交通費", debit_department: "営業部", debit_amount: 100,
    credit_code: "2120", credit_account: "未払金", credit_department: "", credit_amount: 100, memo: "=1+1" }] };
  replies.push(reply);
  const received = await events(await run.POST(request("/api/run", token, runForm())));
  assert.equal(received.some((e) => e.type === "result"), false);
  assert.ok(received.some((e) => e.type === "error" && e.message.includes("数式")));
  assert.equal(deletions.length, 2);
});

test("中止済みのリクエストではClaude呼び出し・アップロードを始めない", async () => {
  const token = load("lib/security.ts").randomId();
  const run = load("app/api/run/route.ts");
  const abort = new AbortController(); abort.abort();
  const stopped = new Request(request("/api/run", token, runForm()), { signal: abort.signal });
  const response = await run.POST(stopped);
  assert.equal(response.status, 408);
  assert.match((await response.json()).error, /中止/);
  assert.equal(calls.length, 0);
  assert.equal(uploads, 0);
  assert.deepEqual(budgetCounters(), {});
});

test("Redisへは原子的な処理をHTTPSで送り、秘密情報は本文やキーに含めない", async () => {
  process.env.VERCEL = "1";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "dummy-not-sent";
  const realFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options });
      return Response.json({ result: 0 });
    };
    await load("lib/security.ts").limitRequests("mock", 5, 60);
    const { url, options } = requests[0];
    const command = JSON.parse(options.body);
    assert.equal(url, "https://redis.example.invalid");
    assert.equal(command[0], "EVAL");
    assert.equal(command[2], "1");
    assert.deepEqual(command.slice(4), ["limit", "5", "60000"]);
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer dummy-not-sent");
    assert.equal(options.body.includes(process.env.UPSTASH_REDIS_REST_TOKEN), false);
  } finally { globalThis.fetch = realFetch; }
});

test("宣言サイズを偽っても実際の受信サイズで上限を確認する", async () => {
  const { readLimitedBody, securityErrorResponse } = load("lib/security.ts");
  const tooLarge = request("/api/settings", null, "x".repeat(100), { "content-length": "1" });
  try { await readLimitedBody(tooLarge, 10); assert.fail("大きすぎる入力を拒否する"); }
  catch (error) { assert.equal(securityErrorResponse(error).status, 413); }
});

test("CSVは数式・全角記号・先頭の不可視文字を拒否し、通常の日本語と引用符は保つ", () => {
  const { toCsv, UnsafeCsvError } = load("lib/journal.ts");
  const entry = { voucher_no: "TR-TEST", date: "2025-12-31", debit_code: "6140", debit_account: "旅費交通費", debit_department: "営業部", debit_amount: 100,
    credit_code: "2120", credit_account: "未払金", credit_department: "", credit_amount: 100, memo: "通常の摘要" };
  for (const text of ["=1+1", "+1", "-1", "@SUM(1)", "＝1+1", "\t=1+1", "\r=1+1", "\u200b=1+1", " \n=1+1"]) {
    for (const field of ["memo", "voucher_no", "debit_account"]) {
      assert.throws(() => toCsv([{ ...entry, [field]: text }]), UnsafeCsvError);
    }
  }
  assert.ok(toCsv([entry]).startsWith("\uFEFF伝票番号"));
  assert.ok(toCsv([{ ...entry, memo: '架空の摘要,"確認"\r改行' }]).includes('"架空の摘要,""確認""\r改行"'));
});

async function putSettings(input, headers = {}) {
  return load("app/api/settings/route.ts").PUT(new Request("http://localhost/api/settings", {
    method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(input),
  }));
}
async function putRecovery(input, headers = {}, signal) {
  return load("app/api/settings/recovery/route.ts").PUT(new Request("http://localhost/api/settings/recovery", {
    method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(input), signal,
  }));
}
async function recoveryPreview(historyId, headers = {}) {
  return load("app/api/settings/recovery/route.ts").GET(new Request(`http://localhost/api/settings/recovery?history=${encodeURIComponent(historyId)}`, { headers }));
}
const taskValues = ({ name, summary, manual, instructionPlaceholder }) => ({ name, summary, manual, instructionPlaceholder });

test("誰でも文言を保存でき、再読み込み・時間経過後も内容が残る", async () => {
  const settings = load("app/api/settings/route.ts");
  const initial = await (await settings.GET()).json();
  const task = initial.tasks[0];
  const response = await putSettings({ version: initial.version, target: "task", taskId: task.id, values: { ...taskValues(task), name: "架空の更新業務", manual: task.manual + "\n\n追加の架空の手順。" } });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.notEqual(updated.version, initial.version);
  cache = new Map();
  const now = Date.now;
  try {
    Date.now = () => now() + 40 * 24 * 3600 * 1000;
    const persisted = await (await load("app/api/settings/route.ts").GET()).json();
    assert.equal(persisted.tasks[0].name, "架空の更新業務");
    assert.ok(persisted.tasks[0].manual.includes("追加の架空の手順。"));
    assert.equal(JSON.stringify(persisted).includes(process.env.ANTHROPIC_API_KEY), false);
  } finally { Date.now = now; }
});

test("同時保存は一方だけ成功し、古い画面から別の人の変更を上書きできない", async () => {
  const initial = await (await load("app/api/settings/route.ts").GET()).json();
  const responses = await Promise.all(["架空の規程A", "架空の規程B"].map((expenseRules) => putSettings({ version: initial.version, target: "rules", expenseRules })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const current = await (await load("app/api/settings/route.ts").GET()).json();
  assert.ok(["架空の規程A", "架空の規程B"].includes(current.expenseRules));
  assert.equal((await putSettings({ version: initial.version, target: "rules", expenseRules: "古い画面からの変更" })).status, 409);
});

test("許可した文言以外・不正な業務ID・空の手順・別サイトからの保存を拒否する", async () => {
  const initial = await (await load("app/api/settings/route.ts").GET()).json();
  const update = { version: initial.version, target: "task", taskId: initial.tasks[0].id, values: taskValues(initial.tasks[0]) };
  assert.equal((await putSettings({ ...update, taskId: "../../.env.local" })).status, 400);
  assert.equal((await putSettings({ ...update, values: { ...update.values, manual: "" } })).status, 400);
  assert.equal((await putSettings({ ...update, values: { ...update.values, file: "任意のファイル" } })).status, 400);
  assert.equal((await putSettings({ ...update, apiKey: "変更しない" })).status, 400);
  assert.equal((await putSettings(update, { origin: "https://other.example.invalid" })).status, 403);
});

test("古い読込結果が残っても画面と実行APIは最新ファイルから同じ版を使う", async () => {
  const taskModule = load("lib/tasks.ts");
  const configuration = load("lib/configuration.ts");
  const initial = await configuration.loadConfiguration();
  // 開発サーバーの片方に古い業務一覧が残った状態を再現する。
  taskModule.tasks[0].manual = "# 読み込み時点の古い手順";
  const current = await configuration.loadConfiguration();
  assert.equal(current.version, initial.version);
  assert.deepEqual(current.tasks, initial.tasks);
  const form = runForm();
  form.set("configurationVersion", current.version);
  replies.push(submitted());
  const response = await load("app/api/run/route.ts").POST(request("/api/run", null, form));
  assert.equal(response.status, 200);
  assert.ok((await events(response)).some((event) => event.type === "result"));
  assert.equal(calls.length, 1);
});

test("保存した手順と共通規程をClaudeへの指示に反映し、古いルールでの再開を止める", async () => {
  let current = await (await load("app/api/settings/route.ts").GET()).json();
  const task = current.tasks.find((item) => item.id === "01-pc-allocation");
  current = await (await putSettings({ version: current.version, target: "task", taskId: task.id, values: { ...taskValues(task), manual: "# 架空の新しいマニュアル\n手順1：架空の入力内容を確認する。" } })).json();
  current = await (await putSettings({ version: current.version, target: "rules", expenseRules: "# 架空の新しい経費精算規程\n## 第1条\n架空の確認ルール。" })).json();
  const token = load("lib/security.ts").randomId();
  const run = load("app/api/run/route.ts");
  replies.push(asked());
  const form = runForm(); form.set("configurationVersion", current.version);
  const first = await events(await run.POST(request("/api/run", token, form)));
  const question = first.find((event) => event.type === "question");
  assert.ok(calls[0].options.system[1].text.includes("架空の新しいマニュアル"));
  assert.ok(calls[0].options.system[1].text.includes("架空の新しい経費精算規程"));
  await putSettings({ version: current.version, target: "rules", expenseRules: "# 再度更新した架空の規程" });
  assert.equal((await run.POST(request("/api/run", token, runForm(question.state)))).status, 409);
  const stale = runForm(); stale.set("configurationVersion", current.version);
  assert.equal((await run.POST(request("/api/run", token, stale))).status, 409);
  assert.equal(calls.length, 1);
  assert.equal(deletions.length, 0);
});

const generalReply = (values = {}) => ({ content: [{ type: "tool_use", name: "submit_result", id: "toolu_result", input: {
  ...result, report: "## 集計結果\n架空の明細を確認しました。", tables: [{ name: "部門別集計", columns: ["部門", "金額"], rows: [["営業部", "100"], ["開発部", "-20"]] }], ...values,
} }], stop_reason: "tool_use", container: { id: "container_mock" } });
function generalForm(batchId) {
  const form = runForm(); form.set("taskId", "00-ai-keiri-man"); form.set("instructions", "架空の明細を部門別に集計してください。仕訳は不要です。");
  if (batchId) form.set("uploadBatch", batchId);
  return form;
}
function uploadForm(file, batchId) {
  const form = new FormData(); form.set("file", file);
  if (batchId) form.set("batchId", batchId);
  return form;
}
async function stageFiles(token, files) {
  let batchId;
  const api = load("app/api/uploads/route.ts");
  for (const file of files) {
    const response = await api.POST(request("/api/uploads", token, uploadForm(file, batchId)));
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json(); batchId = data.batchId;
    assert.equal(JSON.stringify(data).includes("file_mock"), false);
  }
  return batchId;
}

test("汎用業務は依頼文が必須で、添付なしでも報告書・表を返し、サンプルCSVを使わない", async () => {
  const tasks = load("lib/tasks.ts").tasks;
  assert.equal(tasks.length, 4); assert.equal(tasks[0].mode, "general");
  const run = load("app/api/run/route.ts");
  const empty = generalForm(); empty.set("instructions", "  ");
  assert.equal((await run.POST(request("/api/run", null, empty))).status, 400);
  const long = generalForm(); long.set("instructions", "あ".repeat(10001));
  assert.equal((await run.POST(request("/api/run", null, long))).status, 400);
  assert.equal(calls.length, 0);
  replies.push(generalReply());
  const received = await events(await run.POST(request("/api/run", null, generalForm())));
  const completed = received.find((event) => event.type === "result");
  assert.match(completed.report, /集計結果/); assert.equal(completed.tables.length, 1);
  assert.equal(completed.tables[0].csv, "\uFEFF部門,金額\r\n営業部,100\r\n開発部,-20\r\n");
  assert.deepEqual(completed.result.entries, []);
  assert.equal(uploads, 0);
  assert.match(calls[0].options.messages[0].content[0].text, /添付なし/);
  assert.ok(calls[0].options.tools.find((tool) => tool.name === "submit_result").input_schema.required.includes("report"));
});

test("15個の添付を全て渡し、16個目はClaudeへのアップロード前に拒否する", async () => {
  const token = load("lib/security.ts").randomId();
  const files = Array.from({ length: 15 }, (_, i) => new File(["部門,金額\n営業部,100"], `架空明細${i}.csv`));
  const batchId = await stageFiles(token, files);
  assert.equal(uploads, 15);
  const response = await load("app/api/uploads/route.ts").POST(request("/api/uploads", token, uploadForm(files[0], batchId)));
  assert.equal(response.status, 400); assert.match((await response.json()).error, /15個/);
  assert.equal(uploads, 15);
  replies.push(generalReply());
  const run = load("app/api/run/route.ts");
  const received = await events(await run.POST(request("/api/run", token, generalForm(batchId))));
  assert.ok(received.some((event) => event.type === "result"));
  const blocks = calls[0].options.messages[0].content.filter((block) => block.type === "container_upload");
  assert.equal(blocks.length, 15); assert.equal(deletions.length, 0);
  const continuation = received.find((e) => e.type === "result").continuation;
  await load("lib/conversation.ts").closeConversation(continuation.id, load("lib/visitors.ts").visitorForRequest(request("/", token)).id, new MockAnthropic());
  assert.equal(deletions.length, 15);
  assert.equal(new Set(deletions).size, 15);
  assert.equal(uploads, 15);
  assert.equal((await run.POST(request("/api/run", token, generalForm(batchId)))).status, 400);
  assert.equal(calls.length, 1);
});

test("Excel・PDF・画像の内容を壊さず渡し、PDFと画像は見た目の確認用にも添付する", async () => {
  const token = load("lib/security.ts").randomId();
  const files = [
    new File([new Uint8Array([0x50, 0x4b, 3, 4, 0, 1])], "架空.xlsx"),
    new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])], "架空.xls"),
    new File(["%PDF-1.7\n架空のテスト用ヘッダー"], "架空.pdf"),
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])], "架空.png"),
    new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "架空.jpeg"),
    new File(["RIFFxxxxWEBP"], "架空.webp"),
  ];
  const batchId = await stageFiles(token, files);
  for (let i = 0; i < files.length; i++) {
    assert.deepEqual(await uploadCalls[i].options.file.arrayBuffer(), await files[i].arrayBuffer());
    assert.equal(uploadCalls[i].options.expires_in_seconds, 7200);
    assert.equal(uploadCalls[i].requestOptions.signal instanceof AbortSignal, true);
  }
  replies.push(generalReply());
  await events(await load("app/api/run/route.ts").POST(request("/api/run", token, generalForm(batchId))));
  const blocks = calls[0].options.messages[0].content;
  assert.equal(blocks.filter((block) => block.type === "container_upload").length, 6);
  assert.equal(blocks.filter((block) => block.type === "document").length, 1);
  assert.equal(blocks.filter((block) => block.type === "image").length, 3);
  assert.equal(blocks.find((block) => block.type === "document").source.file_id, "file_mock_3");
  assert.equal(deletions.length, 0);
});

test("不正形式・空・3MB超・複数同時送信・別サイトからの添付を拒否する", async () => {
  const api = load("app/api/uploads/route.ts");
  const invalid = [new File(["架空"], "架空.exe"), new File(["偽のPDF"], "架空.pdf"), new File([], "空.csv"), new File([new Uint8Array(3 * 1024 * 1024 + 1)], "大きい.csv")];
  for (const file of invalid) {
    const response = await api.POST(request("/api/uploads", null, uploadForm(file)));
    assert.ok([400, 413].includes(response.status));
  }
  const multiple = uploadForm(new File(["架空"], "架空.csv")); multiple.append("other", new File(["架空"], "別.csv"));
  assert.equal((await api.POST(request("/api/uploads", null, multiple))).status, 400);
  assert.equal((await api.POST(request("/api/uploads", null, uploadForm(new File(["架空"], "架空.csv")), { origin: "https://other.example.invalid" }))).status, 403);
  assert.equal(uploads, 0); assert.equal(calls.length, 0);
});

test("CSVのShift_JISとBOMを整え、中止済みの添付では外部送信を始めない", async () => {
  const token = load("lib/security.ts").randomId();
  const api = load("app/api/uploads/route.ts");
  const controller = new AbortController(); controller.abort();
  const stopped = new Request("http://localhost/api/uploads", { method: "POST", signal: controller.signal, body: uploadForm(new File(["架空"], "架空.csv")) });
  assert.equal((await api.POST(stopped)).status, 408);
  assert.equal(uploads, 0);
  await stageFiles(token, [new File([new Uint8Array([0x82, 0xa0, 0x2c, 0x31])], "架空SJIS.csv"), new File(["\uFEFFあ,1"], "架空UTF8.csv")]);
  assert.equal(await uploadCalls[0].options.file.text(), "あ,1");
  assert.equal(await uploadCalls[1].options.file.text(), "あ,1");
});

test("添付は同じブラウザだけが一度使え、期限切れ・推測したID・直接送信を拒否する", async () => {
  const token = load("lib/security.ts").randomId();
  const other = load("lib/security.ts").randomId();
  const batchId = await stageFiles(token, [new File(["架空"], "架空.csv")]);
  const run = load("app/api/run/route.ts");
  assert.equal((await run.POST(request("/api/run", other, generalForm(batchId)))).status, 400);
  assert.equal((await run.POST(request("/api/run", token, generalForm("file_someone_else")))).status, 400);
  const direct = generalForm(); direct.set("file", new File(["架空"], "架空.csv"));
  assert.equal((await run.POST(request("/api/run", token, direct))).status, 400);
  const api = load("app/api/uploads/route.ts");
  assert.equal((await api.POST(request("/api/uploads", other, uploadForm(new File(["架空"], "架空.csv"), batchId)))).status, 400);
  assert.equal(uploads, 1); assert.equal(calls.length, 0); assert.equal(deletions.length, 0);
  const now = Date.now;
  try {
    Date.now = () => now() + 7201_000;
    assert.equal((await run.POST(request("/api/run", token, generalForm(batchId)))).status, 400);
  } finally { Date.now = now; }
});

test("15添付の質問後も同じファイルと履歴で再開でき、結果後は追加依頼用に保持する", async () => {
  const token = load("lib/security.ts").randomId();
  const batchId = await stageFiles(token, Array.from({ length: 15 }, (_, i) => new File(["架空"], `架空${i}.csv`)));
  const run = load("app/api/run/route.ts");
  replies.push(asked());
  const first = await events(await run.POST(request("/api/run", token, generalForm(batchId))));
  const question = first.find((event) => event.type === "question"); assert.ok(question);
  assert.equal(deletions.length, 0);
  replies.push(generalReply());
  assert.ok((await events(await run.POST(request("/api/run", token, runForm(question.state))))).some((event) => event.type === "result"));
  assert.equal(uploads, 15); assert.equal(deletions.length, 0);
  assert.deepEqual(calls[1].options.messages[0], calls[0].options.messages[0]);
  assert.equal(calls[1].options.container, "container_mock");
});

test("汎用表の形と出力量を確認し、数式入りCSVを止め、負数と引用符は正しく出力する", () => {
  const { parseGeneralResult, tableCsv } = load("lib/general-result.ts");
  const input = generalReply().content[0].input;
  assert.ok(parseGeneralResult(input));
  assert.equal(parseGeneralResult({ ...input, tables: [{ name: "不正", columns: ["A"], rows: [["a", "b"]] }] }), null);
  assert.equal(parseGeneralResult({ ...input, report: "あ".repeat(100001) }), null);
  assert.equal(parseGeneralResult({ ...input, tables: [{ name: "多すぎる", columns: ["A"], rows: Array.from({ length: 501 }, () => ["a"]) }] }), null);
  assert.equal(parseGeneralResult({ ...input, tables: Array.from({ length: 11 }, () => input.tables[0]) }), null);
  assert.equal(tableCsv({ name: "不正", columns: ["A"], rows: [[" =HYPERLINK(\"https://example.invalid\")"]] }), null);
  assert.equal(tableCsv({ name: "不正", columns: ["＋SUM(1,2)"], rows: [] }), null);
  assert.equal(tableCsv({ name: "負数", columns: ["A"], rows: [["-100.50"], ["+20"], ["引用,\"文字\"\n改行"]] }), '\uFEFFA\r\n-100.50\r\n+20\r\n"引用,""文字""\n改行"\r\n');
});

test("危険な表は画面用だけにし、形式不正の汎用結果は提出を止める", async () => {
  const run = load("app/api/run/route.ts");
  const token = load("lib/security.ts").randomId();
  replies.push(generalReply({ tables: [{ name: "架空の確認表", columns: ["内容"], rows: [["=1+1"]] }] }));
  const completed = (await events(await run.POST(request("/api/run", token, generalForm())))).find((event) => event.type === "result");
  assert.equal(completed.tables[0].csv, null);
  replies.push(generalReply({ tables: [{ name: "不正", columns: ["A"], rows: [[100]] }] }));
  const received = await events(await run.POST(request("/api/run", token, generalForm())));
  assert.equal(received.some((event) => event.type === "result"), false);
  assert.ok(received.some((event) => event.type === "error"));
});

// 実際のClaudeには送らず、複数添付の境界と受け渡しを確認する。
async function stageTaskFiles(token, taskId, groups) {
  let batchId;
  for (const { inputId, file } of groups) {
    const form = uploadForm(file, batchId);
    form.set("taskId", taskId); form.set("inputId", inputId);
    const response = await load("app/api/uploads/route.ts").POST(request("/api/uploads", token, form));
    assert.equal(response.status, 200, await response.clone().text());
    batchId = (await response.json()).batchId;
  }
  return batchId;
}
function taskBatchForm(taskId, batchId, inputIds) {
  const form = runForm(); form.set("taskId", taskId); form.set("uploadBatch", batchId);
  form.set("inputIds", JSON.stringify(inputIds)); return form;
}

test("各定型業務で10個を種類別に受け渡し、質問後もファイル名・履歴を保つ", async () => {
  for (const taskId of ["01-pc-allocation", "02-travel-journal", "03-quarterly-closing"]) {
    const task = load("lib/tasks.ts").tasks.find((task) => task.id === taskId);
    const token = load("lib/security.ts").randomId();
    const groups = Array.from({ length: 10 }, (_, i) => ({ inputId: task.inputs[i % task.inputs.length].id, file: new File([`No,金額\n${i},100`], "同名.csv") }));
    const batchId = await stageTaskFiles(token, taskId, groups);
    const beforeUploads = uploads;
    replies.push(asked());
    const run = load("app/api/run/route.ts");
    const received = await events(await run.POST(request("/api/run", token, taskBatchForm(taskId, batchId, task.inputs.map((input) => input.id)))));
    const question = received.find((event) => event.type === "question"); assert.ok(question);
    const call = calls.at(-1);
    const content = call.options.messages[0].content;
    assert.equal(content.filter((block) => block.type === "container_upload").length, 10);
    assert.equal(uploads, beforeUploads, "置き換えた種類のサンプルを追加しない");
    assert.equal(new Set(uploadCalls.slice(-10).map((call) => call.options.file.name)).size, 10, "同名でも実行環境のファイルを上書きしない");
    for (const input of task.inputs) assert.match(content[0].text, new RegExp(input.label));
    assert.match(content[0].text, /元ファイル：同名.csv/);
    assert.match(content[0].text, /元ファイル名ごとの処理件数/);
    replies.push(submitted());
    assert.ok((await events(await run.POST(request("/api/run", token, runForm(question.state))))).some((event) => event.type === "result"));
    assert.deepEqual(calls.at(-1).options.messages[0], call.options.messages[0]);
    assert.equal(uploads, beforeUploads);
  }
});

test("定型業務の11個目・別業務・入力区分偽装・形式とサイズの違反は外部実行前に拒否する", async () => {
  const token = load("lib/security.ts").randomId();
  const csv = new File(["No,金額\n1,100"], "架空.csv");
  const batchId = await stageTaskFiles(token, "01-pc-allocation", Array.from({ length: 10 }, () => ({ inputId: "pc_costs", file: csv })));
  const api = load("app/api/uploads/route.ts");
  const extra = uploadForm(csv, batchId); extra.set("taskId", "01-pc-allocation"); extra.set("inputId", "pc_counts");
  assert.equal((await api.POST(request("/api/uploads", token, extra))).status, 400);
  assert.equal(uploads, 10);
  for (const file of [new File(["%PDF-1.7"], "架空.pdf"), new File([new Uint8Array(1024 * 1024 + 1)], "大きい.csv")]) {
    const form = uploadForm(file); form.set("taskId", "01-pc-allocation"); form.set("inputId", "pc_costs");
    assert.equal((await api.POST(request("/api/uploads", token, form))).status, 400);
  }
  const run = load("app/api/run/route.ts");
  assert.equal((await run.POST(request("/api/run", token, taskBatchForm("02-travel-journal", batchId, ["travel"])))).status, 400);
  assert.equal((await run.POST(request("/api/run", token, taskBatchForm("01-pc-allocation", batchId, ["pc_counts"])))).status, 400);
  assert.equal(calls.length, 0);
  replies.push(submitted());
  const received = await events(await run.POST(request("/api/run", token, taskBatchForm("01-pc-allocation", batchId, ["pc_costs"]))));
  assert.ok(received.some((event) => event.type === "result"));
  assert.equal(uploads, 11, "未選択のPC台数だけサンプルを使う");
  assert.equal(calls[0].options.messages[0].content.filter((block) => block.type === "container_upload").length, 11);
  assert.equal(deletions.length, 11);
});

test("従来の直接送信でも複数CSVを受け取り、11個はAI呼び出し前に拒否する", async () => {
  const run = load("app/api/run/route.ts");
  const form = runForm();
  for (let i = 0; i < 10; i++) form.append("file_pc_costs", new File([`No,金額\n${i},100`], `架空${i}.csv`));
  replies.push(submitted());
  assert.ok((await events(await run.POST(request("/api/run", null, form)))).some((event) => event.type === "result"));
  assert.equal(uploads, 11);
  const tooMany = runForm();
  for (let i = 0; i < 11; i++) tooMany.append("file_pc_costs", new File(["架空"], `架空${i}.csv`));
  assert.equal((await run.POST(request("/api/run", null, tooMany))).status, 400);
  assert.equal(calls.length, 1);
});

test("共通マスタの追加・差し替え・削除は保存後も維持され、古い版は拒否する", async () => {
  const config = load("lib/configuration.ts");
  const first = await config.editableConfiguration();
  assert.equal(first.masters.length, 3);
  const extra = { id: "reference-test", kind: "reference", name: "架空の配賦方針", filename: "policy.md", content: "# 架空の新方針\n根拠番号R-1" };
  const added = await putSettings({ version: first.version, target: "masters", masters: [...first.masters, extra] });
  assert.equal(added.status, 200, await added.clone().text());
  let current = await added.json();
  assert.equal(current.masters.length, 4);
  assert.equal((await putSettings({ version: first.version, target: "masters", masters: [] })).status, 409);
  const replaced = current.masters.map((m) => m.id === extra.id ? { ...m, content: "差し替え済みの架空方針" } : m);
  current = await (await putSettings({ version: current.version, target: "masters", masters: replaced })).json();
  cache = new Map();
  assert.equal((await load("lib/configuration.ts").loadConfiguration()).masters.find((m) => m.id === extra.id).content, "差し替え済みの架空方針");
  const removed = await putSettings({ version: current.version, target: "masters", masters: [] });
  assert.equal(removed.status, 200);
  const empty = await load("lib/configuration.ts").loadConfiguration();
  assert.deepEqual(empty.masters, []); assert.deepEqual(empty.sharedData, []); assert.equal(empty.expenseRules, "");
  assert.equal((await putSettings({ version: empty.version, target: "rules", expenseRules: "古い画面からの規程" })).status, 400);
});

test("差し替えたマスタをAIと独立した仕訳検算に使い、削除した資料を送らない", async () => {
  const initial = await load("lib/configuration.ts").editableConfiguration();
  const masters = [
    { id: "accounts", kind: "accounts", name: "新勘定科目表", filename: "accounts.csv", content: '科目コード,科目名\n9001,"架空,費用"\n9002,架空未払金' },
    { id: "departments", kind: "departments", name: "新部門", filename: "departments.csv", content: "部門コード,部門名,人数\n990,架空部門,3" },
    { id: "ref", kind: "reference", name: "架空方針", filename: "policy.txt", content: "テスト方針R-99" },
  ];
  const current = await (await putSettings({ version: initial.version, target: "masters", masters })).json();
  const reply = submitted();
  reply.content[0].input = { ...result, entries: [{ voucher_no: "T-1", date: "2025-12-31", debit_code: "9001", debit_account: "架空,費用", debit_department: "架空部門", debit_amount: 100,
    credit_code: "9002", credit_account: "架空未払金", credit_department: "", credit_amount: 100, memo: "架空の検算" }] };
  replies.push(reply);
  const form = runForm(); form.set("configurationVersion", current.version);
  const received = await events(await load("app/api/run/route.ts").POST(request("/api/run", null, form)));
  const output = received.find((e) => e.type === "result"); assert.ok(output);
  assert.ok(output.checks.every((c) => c.ok));
  const system = calls[0].options.system[1].text;
  assert.match(system, /テスト方針R-99/); assert.match(system, /9001/); assert.doesNotMatch(system, /1人あたり5,000円/);
  const checks = load("lib/journal.ts").checkEntries(output.result.entries, load("lib/masters.ts").masterChecks([]));
  assert.equal(checks.find((c) => c.label === "勘定科目が勘定科目表と一致").ok, false);
});

test("共通マスタの不正CSV・重複・上限超過・別サイトの保存を拒否する", async () => {
  const initial = await load("lib/configuration.ts").editableConfiguration();
  const save = (masters) => putSettings({ version: initial.version, target: "masters", masters });
  const accounts = initial.masters.find((m) => m.kind === "accounts");
  for (const masters of [
    [accounts, accounts],
    [{ ...accounts, content: "誤った列\n123" }],
    [{ ...accounts, content: "科目コード,科目名\n1,架空A\n1,架空B" }],
    [{ ...accounts, filename: "../../secret.txt" }],
    [{ ...accounts, content: "あ".repeat(50001) }],
    [{ ...accounts, kind: "unknown" }],
    Array.from({ length: 21 }, (_, i) => ({ ...accounts, id: `ref${i}`, kind: "reference" })),
  ]) assert.equal((await save(masters)).status, 400);
  assert.equal((await putSettings({ version: initial.version, target: "masters", masters: [] }, { origin: "https://other.example.invalid" })).status, 403);
  assert.deepEqual((await load("lib/configuration.ts").editableConfiguration()).masters, initial.masters);
});

// 実際のExcel形式を生成し、変換・保存・検算までを外部送信なしで確認する。
function excelBytes(workbook, bookType = "xlsx") {
  const XLSX = require("xlsx");
  const data = XLSX.write(workbook, { type: "buffer", bookType });
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
function masterWorkbook() {
  const XLSX = require("xlsx");
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["科目コード", "科目名"], [1, "架空費用"], [2, "架空未払金"]]);
  sheet.A2.z = "000"; sheet.A3.z = "000";
  XLSX.utils.book_append_sheet(workbook, sheet, "勘定科目");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["部門コード", "部門名", "人数"], ["010", "架空部門", 3]]), "部門");
  return workbook;
}

test("xlsx・xlsから選択したシートだけを取り込み、先頭ゼロと日本語を保存・検算に使う", async () => {
  const api = load("lib/master-excel.ts");
  for (const format of ["xlsx", "xls"]) {
    const source = api.readExcelMaster(excelBytes(masterWorkbook(), format), `架空マスタ.${format}`);
    assert.deepEqual(source.sheetNames, ["勘定科目", "部門"]);
    const accounts = api.excelMasterSheet(source, "勘定科目");
    const departments = api.excelMasterSheet(source, "部門");
    assert.match(accounts.content, /001,架空費用/); assert.doesNotMatch(accounts.content, /部門コード/);
    const initial = await load("lib/configuration.ts").editableConfiguration();
    const masters = [
      { id: "accounts", name: "Excel勘定科目", kind: "accounts", ...accounts },
      { id: "departments", name: "Excel部門", kind: "departments", ...departments },
    ];
    const response = await putSettings({ version: initial.version, target: "masters", masters });
    assert.equal(response.status, 200, await response.clone().text());
    const saved = await response.json();
    assert.equal(saved.masters[0].content, accounts.content);
    const checks = load("lib/masters.ts").masterChecks(saved.masters);
    assert.equal(checks.accountCodes.get("001"), "架空費用");
    assert.ok(checks.departmentNames.has("架空部門"));
  }
});

test("Excelの数式・エラー値・結合セル・過大な範囲は取り込まず、元データを変更しない", () => {
  const api = load("lib/master-excel.ts");
  for (const alter of [
    (s) => { s.B2 = { t: "n", v: 3, f: "1+2" }; },
    (s) => { s.B2 = { t: "e", v: 7 }; },
    (s) => { s["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]; },
    (s) => { s["!ref"] = "A1:CV10001"; },
  ]) {
    const workbook = masterWorkbook(); alter(workbook.Sheets["勘定科目"]);
    const source = api.readExcelMaster(excelBytes(workbook), "架空.xlsx");
    assert.throws(() => api.excelMasterSheet(source, "勘定科目"));
  }
});

test("Excelの不正形式・サイズ超過・存在しないシートを拒否し、非表示シートは選ばせない", () => {
  const api = load("lib/master-excel.ts");
  assert.throws(() => api.readExcelMaster(new TextEncoder().encode("偽のExcel").buffer, "架空.xlsx"));
  assert.throws(() => api.readExcelMaster(new ArrayBuffer(2 * 1024 * 1024 + 1), "架空.xlsx"));
  const workbook = masterWorkbook(); workbook.Workbook = { Sheets: [{ name: "勘定科目", Hidden: 0 }, { name: "部門", Hidden: 1 }] };
  const source = api.readExcelMaster(excelBytes(workbook), "架空.xlsx");
  assert.deepEqual(source.sheetNames, ["勘定科目"]);
  assert.throws(() => api.excelMasterSheet(source, "部門"));
  assert.throws(() => api.excelMasterSheet(source, "存在しないシート"));
});

function regressionEntry(values = {}) {
  return { voucher_no: "T-REG", date: "2026-02-28", debit_code: "6140", debit_account: "旅費交通費", debit_department: "営業部", debit_amount: 100,
    credit_code: "2120", credit_account: "未払金", credit_department: "", credit_amount: 100, memo: "架空の確認", ...values };
}

test("存在しない日付を拒否し、うるう年の日付は正しく検算する", () => {
  const { checkEntries } = load("lib/journal.ts");
  for (const date of ["2026-02-30", "2025-02-29", "2026-04-31", "2026-13-01"]) {
    assert.equal(checkEntries([regressionEntry({ date })]).find((c) => c.label === "日付の形式").ok, false);
  }
  for (const date of ["2024-02-29", "2026-02-28", "2026-12-31"]) {
    assert.ok(checkEntries([regressionEntry({ date })]).every((c) => c.ok));
  }
});

test("丸められる金額は提出時に拒否し、合計の精度限界・貸借差を見逃さない", () => {
  const { parseResult, checkEntries } = load("lib/journal.ts");
  assert.equal(parseResult({ ...result, entries: [regressionEntry({ debit_amount: Number.MAX_SAFE_INTEGER + 1 })] }), null);
  assert.equal(parseResult({ ...result, issues: [{ level: "不明", message: "架空" }] }), null);
  const entries = [regressionEntry({ debit_amount: Number.MAX_SAFE_INTEGER, credit_amount: Number.MAX_SAFE_INTEGER }), regressionEntry({ debit_amount: 1, credit_amount: 2 })];
  const checks = checkEntries(entries);
  assert.equal(checks.find((c) => c.label === "全体の貸借一致").ok, false);
  assert.equal(checks.find((c) => c.label === "金額を正確に扱える範囲").ok, false);
});

function encodedStream(parts) {
  return new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close(); } });
}
test("分割された日本語と改行なしの最終通知を失わず、完了前の切断はエラーにする", async () => {
  const { readRunStream } = load("lib/run-stream.ts");
  const bytes = new TextEncoder().encode('{"type":"status","message":"計算中"}\n{"type":"error","message":"要確認"}');
  const received = [];
  await readRunStream(encodedStream(Array.from(bytes, (byte) => Uint8Array.of(byte))), (e) => received.push(e));
  assert.deepEqual(received.map((e) => e.message), ["計算中", "要確認"]);
  await assert.rejects(readRunStream(encodedStream([new TextEncoder().encode('{"type":"status","message":"開始"}\n')]), () => {}), /通信が終了/);
  await assert.rejects(readRunStream(encodedStream([new TextEncoder().encode('{"type":"res')]), () => {}));
});
test("受信待ちの中止でストリームを解放し、古い結果は通知しない", async () => {
  const { readRunStream } = load("lib/run-stream.ts");
  const controller = new AbortController(); let cancelled = false; const received = [];
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = readRunStream(body, (e) => received.push(e), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(cancelled, true); assert.equal(body.locked, false); assert.deepEqual(received, []);
});

test("規程編集からでも共通マスタ全体の上限を守り、保存先を壊さない", async () => {
  const config = load("lib/configuration.ts"); const initial = await config.editableConfiguration();
  const masters = [
    { id: "rules", name: "架空規程", kind: "rules", filename: "rules.md", content: "短い規程" },
    ...[1, 2, 3].map((n) => ({ id: `ref${n}`, name: `架空資料${n}`, kind: "reference", filename: `ref${n}.txt`, content: "あ".repeat(49000) })),
  ];
  const saved = await putSettings({ version: initial.version, target: "masters", masters }); assert.equal(saved.status, 200);
  const current = await saved.json();
  const rejected = await putSettings({ version: current.version, target: "rules", expenseRules: "あ".repeat(50000) });
  assert.equal(rejected.status, 400);
  assert.deepEqual((await config.editableConfiguration()).masters, current.masters);
});

test("CSVの引用符・改行を正しく読み、引用符の後の不正文字を拒否する", () => {
  const { parseCsv } = load("lib/csv.ts");
  assert.deepEqual(parseCsv('\uFEFFコード,名前\r\n001,"架空,費用"\r\n002,"引用""符\n改行"'), [["コード", "名前"], ["001", "架空,費用"], ["002", '引用"符\n改行']]);
  assert.throws(() => parseCsv('コード,名前\n001,"架空"不正'));
});

test("質問回答直後の利用集中では添付と新しい再開券を保持し、回答を再送できる", async () => {
  const api = load("app/api/run/route.ts"); const token = load("lib/security.ts").randomId();
  replies.push(asked());
  const first = await events(await api.POST(request("/api/run", token, runForm())));
  const question = first.find((e) => e.type === "question");
  replies.push(new MockAnthropic.RateLimitError());
  const limited = await events(await api.POST(request("/api/run", token, runForm(question.state))));
  const retry = limited.find((e) => e.type === "question"); assert.ok(retry);
  assert.notEqual(retry.state, question.state); assert.deepEqual(retry.questions, question.questions); assert.equal(deletions.length, 0);
  assert.equal((await api.POST(request("/api/run", token, runForm(question.state)))).status, 400);
  replies.push(submitted());
  const final = await events(await api.POST(request("/api/run", token, runForm(retry.state))));
  assert.ok(final.some((e) => e.type === "result")); assert.equal(uploads, 2); assert.equal(deletions.length, 2);
  assert.equal(calls.length, 3);
});

test("ローカル保存の壊れた形式を空として扱わず、回数制限を解除しない", async () => {
  const { securityCommand } = load("lib/security-store.ts");
  const file = path.join(process.env.SECURITY_LOCAL_DIR, "security.json");
  for (const raw of ['[]', 'null', '{"壊れた項目":{"value":3,"expiresAt":0}}']) {
    fs.writeFileSync(file, raw);
    await assert.rejects(securityCommand("limit", "invalid-record", "3", 10000));
    assert.equal(fs.readFileSync(file, "utf8"), raw);
  }
});

function followupForm(ticket, instructions = "元資料から交通費だけを再集計してください") {
  const form = new FormData(); form.set("followup", ticket); form.set("instructions", instructions); return form;
}
async function firstConversation(token, files = [new File(["部門,金額\n営業部,100"], "架空の元資料.csv")]) {
  const batchId = files.length ? await stageFiles(token, files) : undefined;
  replies.push(generalReply());
  const response = await load("app/api/run/route.ts").POST(request("/api/run", token, generalForm(batchId)));
  assert.equal(response.status, 200);
  const received = await events(response); const output = received.find((e) => e.type === "result");
  assert.ok(output?.continuation, JSON.stringify(received)); return output;
}

test("初回結果から追加依頼へ元資料・過去の発言・提出結果を改変せず引き継ぎ、IDは暗号化する", async () => {
  const token = load("lib/security.ts").randomId();
  const first = await firstConversation(token);
  assert.equal(deletions.length, 0); assert.doesNotMatch(JSON.stringify(first), /file_mock|container_mock/);
  const before = structuredClone(calls[0].options.messages);
  replies.push(generalReply({ report: "交通費に絞った新しい報告書" }));
  const output = await events(await load("app/api/run/route.ts").POST(request("/api/run", token, followupForm(first.continuation.ticket))));
  const next = output.find((e) => e.type === "result"); assert.ok(next?.continuation);
  assert.equal(next.continuation.turn, 2); assert.equal(next.continuation.expiresAt, first.continuation.expiresAt);
  const messages = calls[1].options.messages;
  assert.deepEqual(messages.slice(0, before.length), before);
  assert.equal(messages[1].content[0].input.report, first.report);
  assert.equal(messages[2].content[0].type, "tool_result");
  assert.match(messages[2].content.at(-1).text, /元資料から/);
  assert.equal(calls[1].options.container, "container_mock");
  assert.equal(uploads, 1); assert.equal(deletions.length, 0);
  const stored = fs.readFileSync(path.join(process.env.SECURITY_LOCAL_DIR, "security.json"), "utf8");
  assert.doesNotMatch(stored, /交通費だけ|集計結果|架空の元資料|messages|report/);
});

test("追加依頼の質問→回答→再開でも同じ資料を使い、上限は回答でリセットしない", async () => {
  const token = load("lib/security.ts").randomId(); const api = load("app/api/run/route.ts");
  const first = await firstConversation(token);
  replies.push(asked());
  const events2 = await events(await api.POST(request("/api/run", token, followupForm(first.continuation.ticket))));
  const question = events2.find((e) => e.type === "question"); assert.ok(question?.continuation);
  assert.doesNotMatch(question.state, /file_mock|container_mock/);
  const owner = load("lib/visitors.ts").visitorForRequest(request("/", token)).id;
  const ticket = await load("lib/conversation.ts").readConversation(question.state, owner, "question");
  assert.equal(ticket.state.roundsUsed, 1);
  const deadline = ticket.state.executionDeadline;
  replies.push(generalReply());
  const resumed = await events(await api.POST(request("/api/run", token, runForm(question.state))));
  const complete = resumed.find((e) => e.type === "result"); assert.ok(complete);
  const saved = await load("lib/conversation.ts").readConversation(complete.continuation.ticket, owner, "result");
  assert.equal(saved.state.executionDeadline, deadline); assert.equal(saved.state.roundsUsed, 2);
  assert.deepEqual(calls[2].options.messages.slice(0, calls[1].options.messages.length), calls[1].options.messages);
  assert.equal(uploads, 1); assert.equal(deletions.length, 0);
});

test("継続の期限切れ・別ブラウザ・改変・再送・設定変更をClaude呼出し前に拒否する", async () => {
  const token = load("lib/security.ts").randomId(); const api = load("app/api/run/route.ts");
  const first = await firstConversation(token); const raw = first.continuation.ticket;
  assert.equal((await api.POST(request("/api/run", load("lib/security.ts").randomId(), followupForm(raw)))).status, 409);
  const tampered = JSON.parse(raw); tampered.data = 'A' + tampered.data.slice(1);
  assert.equal((await api.POST(request("/api/run", token, followupForm(JSON.stringify(tampered))))).status, 409);
  const now = Date.now;
  try { Date.now = () => now() + 7201_000; assert.equal((await api.POST(request("/api/run", token, followupForm(raw)))).status, 409); }
  finally { Date.now = now; }
  // 時刻を戻しても期限切れの券は復活しないので、別の会話で設定変更を確認する。
  const second = await firstConversation(token, []);
  const config = await load("lib/configuration.ts").editableConfiguration();
  await putSettings({ version: config.version, target: "rules", expenseRules: "# 架空の更新規程" });
  assert.equal((await api.POST(request("/api/run", token, followupForm(second.continuation.ticket)))).status, 409);
  assert.equal(calls.length, 2);
});

test("二重の追加依頼は片方だけ処理し、再送・資料追加を拒否する", async () => {
  const token = load("lib/security.ts").randomId(); const api = load("app/api/run/route.ts");
  const first = await firstConversation(token);
  const invalid = followupForm(first.continuation.ticket); invalid.set("uploadBatch", "偽の添付券");
  assert.equal((await api.POST(request("/api/run", token, invalid))).status, 400);
  replies.push(generalReply());
  const responses = await Promise.all([api.POST(request("/api/run", token, followupForm(first.continuation.ticket))), api.POST(request("/api/run", token, followupForm(first.continuation.ticket)))]);
  assert.equal(responses.filter((r) => r.status === 200).length, 1);
  assert.ok([409, 429].includes(responses.find((r) => r.status !== 200).status));
  await events(responses.find((r) => r.status === 200));
  assert.equal((await api.POST(request("/api/run", token, followupForm(first.continuation.ticket)))).status, 409);
  assert.equal(calls.length, 2); assert.equal(uploads, 1);
});

test("追加依頼も新規実行の回数に含め、制限時は券を消費せず資料も削除しない", async () => {
  const token = load("lib/security.ts").randomId(); const first = await firstConversation(token);
  const owner = load("lib/visitors.ts").visitorForRequest(request("/", token)).id;
  const { limitTogether } = load("lib/security.ts");
  for (let i = 0; i < 4; i++) await limitTogether("accepted", [{ key: `new-run:session:${owner}`, count: 5, seconds: 3600 }]);
  const limited = await load("app/api/run/route.ts").POST(request("/api/run", token, followupForm(first.continuation.ticket)));
  assert.equal(limited.status, 429); assert.equal(calls.length, 1); assert.equal(deletions.length, 0);
  assert.ok(await load("lib/conversation.ts").readConversation(first.continuation.ticket, owner, "result"));
});

test("元資料が消えていれば前の結果だけで続けず、環境期限を延ばさない", async () => {
  const token = load("lib/security.ts").randomId();
  const batchId = await stageFiles(token, [new File(["架空"], "架空.csv")]);
  const reply = generalReply(); reply.container.expires_at = new Date(Date.now() + 100_000).toISOString(); replies.push(reply);
  const first = (await events(await load("app/api/run/route.ts").POST(request("/api/run", token, generalForm(batchId))))).find((e) => e.type === "result");
  assert.ok(first.continuation.expiresAt <= Date.now() + 100_000);
  missingFiles.add("file_mock_1");
  const response = await load("app/api/run/route.ts").POST(request("/api/run", token, followupForm(first.continuation.ticket)));
  assert.equal(response.status, 409); assert.match((await response.json()).error, /元の資料/); assert.equal(calls.length, 1);
});

test("明示終了で資料を削除し、新しい依頼には前の資料・会話を混ぜない", async () => {
  const token = load("lib/security.ts").randomId(); const first = await firstConversation(token);
  const end = load("app/api/conversation/end/route.ts");
  const response = await end.POST(request("/api/conversation/end", token, JSON.stringify({ id: first.continuation.id }), { "content-type": "application/json" }));
  assert.equal(response.status, 200); assert.deepEqual(deletions, ["file_mock_1"]);
  assert.equal((await load("app/api/run/route.ts").POST(request("/api/run", token, followupForm(first.continuation.ticket)))).status, 409);
  const second = await firstConversation(token, []);
  assert.notEqual(second.continuation.id, first.continuation.id);
  assert.equal(calls[1].options.messages.length, 1);
  assert.equal(calls[1].options.messages[0].content.filter((b) => b.type === "container_upload").length, 0);
});

test("追加依頼の質問回答に時間がかかっても、5分の実行期限は更新しない", async () => {
  const token = load("lib/security.ts").randomId(); const first = await firstConversation(token, []);
  replies.push(asked());
  const api = load("app/api/run/route.ts");
  const question = (await events(await api.POST(request("/api/run", token, followupForm(first.continuation.ticket))))).find((e) => e.type === "question");
  const now = Date.now;
  try {
    Date.now = () => now() + 301_000;
    assert.equal((await api.POST(request("/api/run", token, runForm(question.state)))).status, 408);
    assert.equal(calls.length, 2);
  } finally { Date.now = now; }
});

test("会話の6回・100発言・1MB上限を守り、上限時も最後の結果は返す", async () => {
  const token = load("lib/security.ts").randomId(); let previous = await firstConversation(token, []);
  const api = load("app/api/run/route.ts"); const now = Date.now;
  try {
    // 1時間後の追加依頼を模擬し、毎時5件の制限と会話6回の制限を別々に確認する。
    Date.now = () => now() + 3601_000;
    for (let i = 2; i <= 6; i++) {
      replies.push(generalReply());
      const response = await api.POST(request("/api/run", token, followupForm(previous.continuation.ticket)));
      assert.equal(response.status, 200);
      previous = (await events(response)).find((e) => e.type === "result"); assert.ok(previous);
      if (i < 6) assert.equal(previous.continuation.turn, i);
    }
    assert.equal(previous.continuation, undefined); assert.match(previous.continuationNotice, /6回/);
  } finally { Date.now = now; }
  const { checkConversationSize } = load("lib/conversation.ts");
  assert.throws(() => checkConversationSize({ ...state(), messages: Array(101).fill({ role: "user", content: "架空" }) }));
  assert.throws(() => checkConversationSize({ ...state(), messages: [{ role: "user", content: "あ".repeat(400000) }] }));
});

test("追加依頼中に失敗しても枠を解放し資料を削除し、使った券で再実行しない", async () => {
  const token = load("lib/security.ts").randomId(); const first = await firstConversation(token);
  const api = load("app/api/run/route.ts"); replies.push(new MockAnthropic.BadRequestError());
  const failed = await events(await api.POST(request("/api/run", token, followupForm(first.continuation.ticket))));
  assert.ok(failed.some((e) => e.type === "error")); assert.deepEqual(deletions, ["file_mock_1"]);
  assert.equal((await api.POST(request("/api/run", token, followupForm(first.continuation.ticket)))).status, 409);
  const owner = load("lib/visitors.ts").visitorForRequest(request("/", token)).id;
  const release = await load("lib/security.ts").acquireRunLease(owner); await release();
  assert.equal(calls.length, 2);
});

test("追加依頼中の質問でも12往復の上限を保ち、終了時に添付を片付ける", async () => {
  const token = load("lib/security.ts").randomId(); const first = await firstConversation(token);
  const owner = load("lib/visitors.ts").visitorForRequest(request("/", token)).id;
  const conversation = load("lib/conversation.ts");
  const { state: checkpoint } = await conversation.readConversation(first.continuation.ticket, owner, "result");
  checkpoint.roundsUsed = 11; checkpoint.questionsAsked = 1;
  checkpoint.messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_result", content: "確認" }] });
  checkpoint.messages.push({ role: "assistant", content: asked().content });
  const question = await conversation.sealConversation(checkpoint, owner, "question");
  replies.push(asked());
  const received = await events(await load("app/api/run/route.ts").POST(request("/api/run", token, runForm(question.ticket))));
  assert.ok(received.some((e) => e.type === "error" && /上限/.test(e.message)));
  assert.ok(!received.some((e) => e.type === "question")); assert.equal(deletions.length, 1);
});

test("手順・プレビュー・報告書の共通表示で画像の読込とHTML埋込を止め、表や文章を保つ", () => {
  const { createElement } = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const SafeMarkdown = load("components/SafeMarkdown.tsx").default;
  const markdown = `## 架空の確認結果

- 内容を確認してください

| 部門 | 金額 |
| --- | --- |
| 営業部 | 100 |

[確認先](https://example.invalid/reference)

![外部画像](https://example.invalid/pixel.png)
![相対画像](/pixel.png)
![参照画像][image]

[image]: https://example.invalid/reference.png

<img src="https://example.invalid/raw.png" onerror="alert(1)">
<iframe src="https://example.invalid/frame"></iframe>
<script>alert(1)</script>
`;
  // 閉じた詳細欄でも、画像や先読み用のタグを一切生成させない。
  const html = renderToStaticMarkup(createElement("details", null, createElement("summary", null, "読む"), createElement(SafeMarkdown, null, markdown)));
  assert.doesNotMatch(html, /<(?:img|link|iframe|script)\b/i);
  assert.doesNotMatch(html, /pixel\.png|reference\.png|raw\.png|onerror|alert\(1\)/);
  assert.match(html, /<h2>架空の確認結果<\/h2>/);
  assert.match(html, /<li>内容を確認してください<\/li>/);
  assert.match(html, /<table>/);
  assert.match(html, /<td>100<\/td>/);
  assert.match(html, /移動先：https:\/\/example\.invalid\/reference/);
  assert.doesNotMatch(html, /<a\b[^>]*href="https?:/);
});

function budgetCounters(scope = "accepted") {
  const filename = path.join(process.env.SECURITY_LOCAL_DIR, "security.json");
  if (!fs.existsSync(filename)) return {};
  const records = JSON.parse(fs.readFileSync(filename, "utf8"));
  const record = Object.entries(records).find(([key]) => key.endsWith(`:budgets:${scope}`))?.[1];
  return record ? JSON.parse(record.value) : {};
}
async function ownedEndBody(token) {
  const owner = load("lib/visitors.ts").visitorForRequest(request("/", token)).id;
  const continuation = await load("lib/conversation.ts").sealConversation(state(), owner, "result");
  return JSON.stringify({ id: continuation.id });
}

test("正当な会話終了は同じブラウザから毎時30回までで、超過時に待ち時間を返す", async () => {
  const end = load("app/api/conversation/end/route.ts").POST;
  const token = load("lib/security.ts").randomId();
  for (let i = 0; i < 30; i++) assert.equal((await end(request("/api/conversation/end", token, await ownedEndBody(token)))).status, 200);
  const blocked = await end(request("/api/conversation/end", token, await ownedEndBody(token)));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  assert.equal(calls.length, 0); assert.equal(deletions.length, 30);
  assert.equal(budgetCounters()["end:global"].count, 30);
});

test("会話終了は識別情報と転送ヘッダーを変えても同じ接続元から毎時60回で止まる", async () => {
  const end = load("app/api/conversation/end/route.ts").POST;
  for (let i = 1; i <= 60; i++) {
    const token = i.toString(16).padStart(64, "0");
    const response = await end(request("/api/conversation/end", token, await ownedEndBody(token), { "x-forwarded-for": `192.0.2.${i}`, "x-vercel-forwarded-for": `192.0.2.${i}` }));
    assert.equal(response.status, 200);
  }
  const now = Date.now;
  try {
    Date.now = () => now() + 61_000;
    const blocked = await end(request("/api/conversation/end", "f".repeat(64), await ownedEndBody("f".repeat(64))));
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 3000);
  } finally { Date.now = now; }
  assert.equal(Object.keys(budgetCounters()).filter((key) => /^end:[a-f0-9]{64}$/.test(key)).length, 60);
  assert.equal(calls.length, 0); assert.equal(deletions.length, 60);
});

test("会話終了は接続元と識別情報を変えても全体で毎時120回に制限する", async () => {
  const security = load("lib/security.ts");
  // ホスティング側が確認した異なる接続元を模擬し、全体の制限を単独で確認する。
  security.requestAddress = (req) => security.digestValue("test-address", req.headers.get("x-test-address"));
  const end = load("app/api/conversation/end/route.ts").POST;
  for (let i = 1; i <= 120; i++) {
    const token = i.toString(16).padStart(64, "0");
    assert.equal((await end(request("/api/conversation/end", token, await ownedEndBody(token), { "x-test-address": String(i) }))).status, 200);
  }
  assert.equal((await end(request("/api/conversation/end", "f".repeat(64), await ownedEndBody("f".repeat(64)), { "x-test-address": "121" }))).status, 429);
  assert.equal(Object.keys(budgetCounters()).filter((key) => /^end:[a-f0-9]{64}$/.test(key)).length, 120);
  assert.equal(Object.keys(budgetCounters()).filter((key) => key.startsWith("end:address:")).length, 120);
});

test("不正な会話IDは実行枠を取得せず拒否し、別ブラウザ・別サイト・過大な終了要求で資料を削除しない", async () => {
  const security = load("lib/security.ts");
  const releaseA = await security.acquireRunLease("review-a");
  const releaseB = await security.acquireRunLease("review-b");
  const end = load("app/api/conversation/end/route.ts").POST;
  try {
    assert.equal((await end(request("/api/conversation/end", "a".repeat(64), JSON.stringify({ id: "invalid" })))).status, 400);
  } finally { await releaseA(); await releaseB(); }
  const token = security.randomId();
  const first = await firstConversation(token);
  const body = JSON.stringify({ id: first.continuation.id });
  assert.equal((await end(request("/api/conversation/end", security.randomId(), body))).status, 409);
  assert.equal((await end(request("/api/conversation/end", token, body, { origin: "https://example.invalid", "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await end(request("/api/conversation/end", token, " ".repeat(1025)))).status, 413);
  assert.deepEqual(deletions, []);
  assert.equal((await end(request("/api/conversation/end", token, body))).status, 200);
  assert.deepEqual(deletions, ["file_mock_1"]);
  assert.equal((await end(request("/api/conversation/end", token, body))).status, 409);
});

test("個別枠を超えた並列送信で共有枠を減らさず、別の利用者は残りの枠を使える", async () => {
  const { limitTogether } = load("lib/security.ts");
  const apply = (who) => limitTogether("accepted", [{ key: `person:${who}`, count: 5, seconds: 3600 }, { key: "everyone", count: 10, seconds: 3600 }]);
  const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => apply("a")));
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 5);
  assert.equal(budgetCounters().everyone.count, 5);
  for (let i = 0; i < 5; i++) await apply("b");
  await assert.rejects(apply("c"));
  assert.equal(budgetCounters().everyone.count, 10);
  assert.equal(budgetCounters()["person:c"], undefined);
});

test("同じ版への並列保存は成功した1件だけを共有の保存枠へ計上する", async () => {
  const initial = await (await load("app/api/settings/route.ts").GET()).json();
  const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => putSettings({ version: initial.version, target: "rules", expenseRules: `架空の規程${index}` })));
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 409).length, 11);
  assert.equal(budgetCounters()["settings:global"].count, 1);
});

test("同じ再開券を並列に確認しても、遅れた送信は利用枠の計上前に送信済みと判断する", async () => {
  const security = load("lib/security.ts");
  const token = security.randomId();
  const run = load("app/api/run/route.ts").POST;
  replies.push(asked());
  const question = (await events(await run(request("/api/run", token, runForm())))).find((event) => event.type === "question");
  const acquire = security.acquireRunLease;
  let callsToAcquire = 0;
  let openFirst, openSecond, bothReady;
  const firstGate = new Promise((resolve) => { openFirst = resolve; });
  const secondGate = new Promise((resolve) => { openSecond = resolve; });
  const ready = new Promise((resolve) => { bothReady = resolve; });
  security.acquireRunLease = async (owner) => {
    const position = ++callsToAcquire;
    if (position === 2) bothReady();
    await firstGate;
    if (position === 2) await secondGate;
    return acquire(owner);
  };
  replies.push(submitted());
  const a = run(request("/api/run", token, runForm(question.state)));
  const b = run(request("/api/run", token, runForm(question.state)));
  await ready; openFirst();
  assert.ok((await events(await a)).some((event) => event.type === "result"));
  openSecond();
  assert.equal((await b).status, 409);
  assert.equal(budgetCounters()["run:global"].count, 2);
});

test("予約語に見える枠名も普通の名前として扱い、壊れた複合カウンタでは停止する", async () => {
  const security = load("lib/security.ts");
  for (const key of ["__proto__", "constructor", "toString"]) {
    await security.limitTogether("accepted", [{ key, count: 1, seconds: 3600 }]);
    await assert.rejects(security.limitTogether("accepted", [{ key, count: 1, seconds: 3600 }]));
    assert.equal(budgetCounters()[key].count, 1);
  }
  await load("lib/security-store.ts").securityCommand("set", "budgets:accepted", JSON.stringify({ broken: { count: "not-a-number", expiresAt: Date.now() + 60000 } }), 60000);
  await assert.rejects(security.limitTogether("accepted", [{ key: "safe", count: 5, seconds: 3600 }]));
});

test("保存先が回数の確認に整数以外を返しても、許可の0に読み替えない", async () => {
  process.env.VERCEL = "1";
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "dummy-not-sent";
  const realFetch = globalThis.fetch;
  try {
    for (const result of [null, false, [], "", "0", -1, 0.5]) {
      globalThis.fetch = async () => Response.json({ result });
      const security = load("lib/security.ts");
      await assert.rejects(security.limitRequests("invalid", 5, 60));
      await assert.rejects(security.limitTogether("accepted", [{ key: "invalid", count: 5, seconds: 60 }]));
    }
  } finally { globalThis.fetch = realFetch; }
});

test("不正送信や識別情報の切替で他の接続元の業務枠を使い切れない", async () => {
  const security = load("lib/security.ts");
  security.requestAddress = (req) => security.digestValue("test-address", req.headers.get("x-test-address") || "a");
  const run = load("app/api/run/route.ts").POST;
  for (let i = 0; i < 60; i++) {
    const response = await run(request("/api/run", null, "x"));
    assert.equal(response.status, i < 30 ? 400 : 429);
  }
  replies.push(submitted());
  assert.ok((await events(await run(request("/api/run", null, runForm(), { "x-test-address": "b" })))).some((event) => event.type === "result"));
  assert.equal(budgetCounters()["new-run:global"].count, 1);
  const now = Date.now;
  try {
    Date.now = () => now() + 61_000;
    for (let i = 0; i < 5; i++) { replies.push(submitted()); await events(await run(request("/api/run", null, runForm()))); }
    for (let i = 0; i < 10; i++) assert.equal((await run(request("/api/run", null, runForm()))).status, 429);
    replies.push(submitted());
    assert.ok((await events(await run(request("/api/run", null, runForm(), { "x-test-address": "b" })))).some((event) => event.type === "result"));
    assert.equal(budgetCounters()["new-run:global"].count, 7);
  } finally { Date.now = now; }
});

test("不正な保存・添付・会話終了は正当な処理の共有枠を消費しない", async () => {
  const security = load("lib/security.ts");
  security.requestAddress = (req) => security.digestValue("test-address", req.headers.get("x-test-address") || "a");
  const settings = load("app/api/settings/route.ts");
  for (let i = 0; i < 30; i++) assert.equal((await putSettings({ version: "invalid", target: "rules", expenseRules: "架空の規程" })).status, 409);
  const initial = await (await settings.GET()).json();
  assert.equal((await putSettings({ version: initial.version, target: "rules", expenseRules: "架空の変更規程" }, { "x-test-address": "b" })).status, 200);
  const upload = load("app/api/uploads/route.ts");
  for (let i = 0; i < 20; i++) assert.equal((await upload.POST(request("/api/uploads", null, new FormData()))).status, 400);
  const token = security.randomId();
  assert.equal((await upload.POST(request("/api/uploads", token, uploadForm(new File(["a,b"], "架空.csv")), { "x-test-address": "b" }))).status, 200);
  for (let i = 0; i < 20; i++) assert.equal((await load("app/api/conversation/end/route.ts").POST(request("/api/conversation/end", null, JSON.stringify({ id: security.randomId() })))).status, 409);
  assert.equal(budgetCounters()["settings:global"].count, 1);
  assert.equal(budgetCounters()["uploads:global"].count, 1);
  assert.equal(budgetCounters()["end:global"], undefined);
});

test("公開用のAI設定はAPIの直接送信・古い再開券でも広げられず、安全な初期値で実行する", async () => {
  const usage = load("lib/usage-policy.ts");
  const policy = usage.loadUsagePolicy({ NODE_ENV: "production" });
  usage.loadUsagePolicy = () => policy;
  const run = load("app/api/run/route.ts").POST;
  const badModel = runForm(); badModel.set("model", "claude-fable-5-1");
  assert.equal((await run(request("/api/run", null, badModel))).status, 400);
  const badEffort = runForm(); badEffort.set("effort", "max");
  assert.equal((await run(request("/api/run", null, badEffort))).status, 400);
  const token = load("lib/security.ts").randomId();
  const owner = load("lib/visitors.ts").visitorForRequest(request("/", token)).id;
  const config = await load("lib/configuration.ts").loadConfiguration();
  const old = await load("lib/run-state.ts").sealRunState({ ...state(), model: "claude-fable-5-1", effort: "max", configurationVersion: config.version }, owner);
  assert.equal((await run(request("/api/run", token, runForm(old)))).status, 400);
  const oldConversation = await load("lib/conversation.ts").sealConversation({ ...state(), taskId: "00-ai-keiri-man", model: "claude-fable-5-1", effort: "max", configurationVersion: config.version }, owner, "result");
  assert.equal((await run(request("/api/run", token, followupForm(oldConversation.ticket)))).status, 409);
  assert.equal(calls.length, 0);
  const normal = runForm(); normal.delete("model"); normal.delete("effort"); replies.push(submitted());
  assert.ok((await events(await run(request("/api/run", token, normal)))).some((event) => event.type === "result"));
  assert.equal(calls[0].options.model, "claude-haiku-5-5");
  assert.equal(calls[0].options.output_config.effort, "low");
  assert.equal(calls[0].options.max_tokens, 8000);
  assert.equal(calls[0].options.fallbacks, undefined);
});

test("公開用の接続元上限とClaude往復上限を実行APIでも適用する", async () => {
  const usage = load("lib/usage-policy.ts");
  const policy = usage.loadUsagePolicy({ NODE_ENV: "production", PUBLIC_MAX_ROUNDS: "2" });
  usage.loadUsagePolicy = () => policy;
  const run = load("app/api/run/route.ts").POST;
  replies.push({ content: [], stop_reason: "pause_turn" }, { content: [], stop_reason: "pause_turn" });
  assert.ok((await events(await run(request("/api/run", null, runForm())))).some((event) => event.type === "error"));
  assert.equal(calls.length, 2);
  for (let i = 0; i < 2; i++) { replies.push(submitted()); await events(await run(request("/api/run", null, runForm()))); }
  assert.equal((await run(request("/api/run", null, runForm()))).status, 429);
  assert.equal(budgetCounters()["new-run:global"].count, 3);
});

test("生成された成果物は取得直後に削除し、任意のツール入力のfile_idを削除対象にしない", async () => {
  const reply = submitted();
  reply.content.unshift({ type: "bash_code_execution_tool_result", content: { type: "bash_code_execution_result", return_code: 0, content: [{ type: "bash_code_execution_output", file_id: "file_generated" }] } });
  reply.content.at(-1).input = { ...result, file_id: "file_other_person" };
  replies.push(reply);
  await events(await load("app/api/run/route.ts").POST(request("/api/run", null, runForm())));
  assert.deepEqual(deletions.sort(), ["file_generated", "file_mock_1", "file_mock_2"]);
});

test("切断前に通知された生成物も回収し、削除失敗したIDは所有者の会話終了で再試行する", async () => {
  const generated = { type: "bash_code_execution_tool_result", content: { type: "bash_code_execution_result", return_code: 0, content: [{ type: "bash_code_execution_output", file_id: "file_generated" }] } };
  replies.push(submitted());
  streamEvents.push({ type: "content_block_start", index: 0, content_block: generated }, new Error("模擬的な切断"));
  await events(await load("app/api/run/route.ts").POST(request("/api/run", null, runForm())));
  assert.ok(deletions.includes("file_generated"));
  const token = load("lib/security.ts").randomId();
  const reply = generalReply(); reply.content.unshift(generated); replies.push(reply);
  deleteFailures.add("file_generated");
  const first = (await events(await load("app/api/run/route.ts").POST(request("/api/run", token, generalForm())))).find((event) => event.type === "result");
  assert.ok(first.continuation);
  deleteFailures.clear();
  assert.equal((await load("app/api/conversation/end/route.ts").POST(request("/api/conversation/end", token, JSON.stringify({ id: first.continuation.id })))).status, 200);
  assert.equal(deletions.filter((id) => id === "file_generated").length, 3);
});

test("通常保存30回で入口と1時間の枠を使い切っても、専用画面から初期値へ復元できる", async () => {
  const api = load("lib/configuration.ts");
  const original = await api.editableConfiguration();
  let current = original;
  for (let i = 0; i < 30; i++) {
    const response = await putSettings({ version: current.version, target: "rules", expenseRules: `架空の書換え第${i + 1}版` });
    assert.equal(response.status, 200);
    current = await response.json();
  }
  assert.equal((await putSettings({ version: current.version, target: "rules", expenseRules: "架空の追加書換え" })).status, 429);
  assert.equal((await load("app/api/settings/route.ts").GET(new Request("http://localhost/api/settings"))).status, 429);
  const unwantedId = current.history[0].id;
  const preview = await recoveryPreview("initial");
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "no-store");
  const detail = await preview.json();
  assert.ok(detail.changes.some((change) => change.after.includes(original.expenseRules)));
  const restored = await putRecovery({ version: detail.version, target: "restore", historyId: detail.entry.id });
  assert.equal(restored.status, 200);
  const recovered = await restored.json();
  assert.deepEqual(recovered.masters, original.masters);
  // 初期値へ戻した直後でも、使い切った通常保存枠を履歴復元で迂回させない。
  const reapplied = await putRecovery({ version: recovered.version, target: "restore", historyId: unwantedId });
  assert.equal(reapplied.status, 429);
  assert.equal((await api.editableConfiguration()).version, recovered.version);
  assert.equal(budgetCounters()["settings:global"].count, 30);
  assert.equal(budgetCounters()["recovery:global"].count, 1);
  assert.equal(budgetCounters()["history-restore:global"], undefined);
});

test("共有の通常保存60回が満杯でも別枠の復元が成功し、通常保存枠を増減しない", async () => {
  const security = load("lib/security.ts");
  security.requestAddress = (req) => security.digestValue("test-address", req.headers.get("x-test-address") || "a");
  const api = load("lib/configuration.ts");
  let current = await api.editableConfiguration();
  current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: "架空の上書きされた規程" });
  // 2つの接続元が使い切った共有枠を、実APIを呼ばずに再現する。
  for (let i = 0; i < 60; i++) await security.limitTogether("accepted", [{ key: "settings:global", count: 60, seconds: 3600 }]);
  assert.equal((await putSettings({ version: current.version, target: "rules", expenseRules: "架空の通常変更" }, { "x-test-address": "c" })).status, 429);
  assert.equal((await recoveryPreview("baseline", { "x-test-address": "c" })).status, 200);
  assert.equal((await putRecovery({ version: current.version, target: "restore", historyId: "baseline" }, { "x-test-address": "c" })).status, 200);
  assert.equal(budgetCounters()["settings:global"].count, 60);
  assert.equal(budgetCounters()[`settings:address:${security.digestValue("test-address", "c")}`], undefined);
  assert.equal(budgetCounters()["recovery:global"].count, 1);
});

test("復元用の経路から通常編集を送って保存制限を迂回できず、通常経路の復元も拒否する", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  const task = initial.tasks[0];
  for (const input of [
    { version: initial.version, target: "task", taskId: task.id, values: { ...taskValues(task), name: "架空の迂回編集" } },
    { version: initial.version, target: "masters", masters: [] },
    { version: initial.version, target: "rules", expenseRules: "架空の迂回規程" },
    { version: initial.version, target: "restore", historyId: "initial", snapshot: { masters: [] } },
    { version: initial.version, target: "restore", historyId: "../../.env.local" },
    null, [],
  ]) assert.equal((await putRecovery(input)).status, 400);
  assert.equal((await putSettings({ version: initial.version, target: "restore", historyId: "initial" })).status, 400);
  assert.equal((await recoveryPreview("../../.env.local")).status, 400);
  assert.equal((await putRecovery({ version: initial.version, target: "restore", historyId: "initial" }, { origin: "https://other.example.invalid" })).status, 403);
  assert.equal((await putRecovery({ version: initial.version, target: "restore", historyId: "initial" }, { "sec-fetch-site": "cross-site" })).status, 403);
  assert.equal((await api.editableConfiguration()).version, initial.version);
  assert.equal(budgetCounters()["settings:global"], undefined);
  assert.equal(budgetCounters()["recovery:global"], undefined);
});

test("同じ内容・古い版・偽ID・中止された復元は受け付けた復元枠へ数えない", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  assert.equal((await putRecovery({ version: initial.version, target: "restore", historyId: "initial" })).status, 400);
  const changed = await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の変更後の規程" });
  assert.equal((await putRecovery({ version: initial.version, target: "restore", historyId: "initial" })).status, 409);
  assert.equal((await putRecovery({ version: changed.version, target: "restore", historyId: "0".repeat(64) })).status, 404);
  const abort = new AbortController(); abort.abort();
  assert.equal((await putRecovery({ version: changed.version, target: "restore", historyId: "baseline" }, {}, abort.signal)).status, 408);
  assert.equal(budgetCounters()["recovery:global"], undefined);
  assert.equal((await api.editableConfiguration()).version, changed.version);
  assert.equal((await putRecovery({ version: changed.version, target: "restore", historyId: "baseline" })).status, 200);
  assert.equal(budgetCounters()["recovery:global"].count, 1);
});

test("同じ版への並列復元は1件だけ成功し、共有の復元枠も1件だけ減る", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  const changed = await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の並列復元前の規程" });
  const responses = await Promise.all(Array.from({ length: 12 }, () => putRecovery({ version: changed.version, target: "restore", historyId: "baseline" })));
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 409).length, 11);
  assert.equal(budgetCounters()["recovery:global"].count, 1);
  assert.equal((await api.editableConfiguration()).expenseRules, initial.expenseRules);
});

async function distinctProtectedRecovery() {
  // 配布値とは異なる固定控えを、実際の設定を触らず旧形式の一時データから用意する。
  await load("lib/security-store.ts").securityCommand("set", "configuration:current", JSON.stringify({ revision: "legacy", tasks: {}, expenseRules: "架空の固定控えの規程", updatedAt: "2026-11-01T00:00:00.000Z" }), 3600000);
  const api = load("lib/configuration.ts");
  const legacy = await api.editableConfiguration();
  const current = await api.saveConfiguration({ version: legacy.version, target: "rules", expenseRules: "架空の現在の規程" });
  return { api, current };
}

test("初期値と固定控えの復元は同じ接続元で1分5回までに抑え、短時間枠だけなら1分後に再開できる", async () => {
  const setup = await distinctProtectedRecovery();
  const api = setup.api;
  let current = setup.current;
  for (let i = 0; i < 5; i++) {
    const response = await putRecovery({ version: current.version, target: "restore", historyId: i % 2 === 0 ? "initial" : "baseline" });
    assert.equal(response.status, 200);
    current = await response.json();
  }
  const blocked = await putRecovery({ version: current.version, target: "restore", historyId: "baseline" });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0 && Number(blocked.headers.get("retry-after")) <= 60);
  assert.equal((await api.editableConfiguration()).version, current.version);
  assert.equal(budgetCounters()["recovery:global"].count, 5);
  assert.equal(budgetCounters()["recovery-hour:global"].count, 5);
  assert.equal(budgetCounters()["settings:global"], undefined);
  const now = Date.now;
  try {
    Date.now = () => now() + 61_000;
    assert.equal((await putRecovery({ version: current.version, target: "restore", historyId: "baseline" })).status, 200);
    assert.equal(budgetCounters()["recovery:global"].count, 1);
    assert.equal(budgetCounters()["recovery-hour:global"].count, 6);
  } finally { Date.now = now; }
});

test("初期値と固定控えの復元は全体でも1分10回までに抑え、拒否時に別接続元の枠を減らさない", async () => {
  const security = load("lib/security.ts");
  security.requestAddress = (req) => security.digestValue("test-address", req.headers.get("x-test-address") || "a");
  const setup = await distinctProtectedRecovery();
  const api = setup.api;
  let current = setup.current;
  for (let i = 0; i < 10; i++) {
    const response = await putRecovery({ version: current.version, target: "restore", historyId: i % 2 === 0 ? "initial" : "baseline" }, { "x-test-address": `source-${i}` });
    assert.equal(response.status, 200);
    current = await response.json();
  }
  const blocked = await putRecovery({ version: current.version, target: "restore", historyId: "initial" }, { "x-test-address": "spare" });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) <= 60);
  assert.equal(budgetCounters()["recovery:global"].count, 10);
  assert.equal(budgetCounters()["recovery-hour:global"].count, 10);
  assert.equal(budgetCounters()[`recovery:address:${security.digestValue("test-address", "spare")}`], undefined);
  assert.equal((await api.editableConfiguration()).version, current.version);
});

test("最近の履歴への復元は通常保存と同じ1時間枠を使い、初期値・固定控えの枠を消費しない", async () => {
  const api = load("lib/configuration.ts");
  const security = load("lib/security.ts");
  let current = await api.editableConfiguration();
  current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: "架空の改訂前の規程" });
  const previousId = current.history[0].id;
  current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: "架空の改訂後の規程" });
  const address = security.requestAddress(new Request("http://localhost/api/settings"));
  for (let i = 0; i < 29; i++) await security.limitTogether("accepted", [
    { key: `settings:address:${address}`, count: 30, seconds: 3600 },
    { key: "settings:global", count: 60, seconds: 3600 },
  ]);
  const restored = await putRecovery({ version: current.version, target: "restore", historyId: previousId });
  assert.equal(restored.status, 200);
  current = await restored.json();
  assert.equal(current.expenseRules, "架空の改訂前の規程");
  assert.equal(budgetCounters()["settings:global"].count, 30);
  assert.equal(budgetCounters()["history-restore:global"].count, 1);
  assert.equal(budgetCounters()["recovery:global"], undefined);
  assert.equal(budgetCounters()["recovery-hour:global"], undefined);
  assert.equal((await putSettings({ version: current.version, target: "rules", expenseRules: "架空の31回目の変更" })).status, 429);
  assert.equal((await api.editableConfiguration()).version, current.version);
});

test("正しい4改訂を保存後に最近の履歴を交互に10回復元しても、履歴を追加して押し出さない", async () => {
  const api = load("lib/configuration.ts");
  const store = load("lib/security-store.ts");
  let current = await api.editableConfiguration();
  for (let i = 0; i < 4; i++) current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: `架空の正しい改訂${i + 1}` });
  const ids = [current.history[1].id, current.history[2].id];
  const before = JSON.parse(await store.securityCommand("get", "configuration:current"));
  const now = Date.now;
  let offset = 0;
  try {
    Date.now = () => now() + offset;
    for (let i = 0; i < 10; i++) {
      offset = Math.floor(i / 5) * 61_000;
      const previousVersion = current.version;
      const response = await putRecovery({ version: current.version, target: "restore", historyId: ids[i % 2] });
      assert.equal(response.status, 200);
      current = await response.json();
      assert.notEqual(current.version, previousVersion);
      assert.equal(current.history.find((entry) => entry.id === ids[i % 2]).isCurrent, true);
      assert.deepEqual(JSON.parse(await store.securityCommand("get", "configuration:current")).history, before.history);
    }
  } finally { Date.now = now; }
  assert.equal(budgetCounters()["settings:global"].count, 10);
  assert.equal(budgetCounters()["recovery:global"], undefined);
  assert.deepEqual(JSON.parse(await store.securityCommand("get", "configuration:current")).protectedBaseline, before.protectedBaseline);
});

test("初期値と固定控えの復元にも接続元ごとの1時間上限があり、1分待ちだけでは解除されない", async () => {
  const setup = await distinctProtectedRecovery();
  const api = setup.api;
  let current = setup.current;
  const now = Date.now;
  let offset = 0;
  try {
    Date.now = () => now() + offset;
    for (let i = 0; i < 10; i++) {
      offset = Math.floor(i / 5) * 61_000;
      const response = await putRecovery({ version: current.version, target: "restore", historyId: i % 2 === 0 ? "initial" : "baseline" });
      assert.equal(response.status, 200);
      current = await response.json();
    }
    offset = 122_000;
    const blocked = await putRecovery({ version: current.version, target: "restore", historyId: "initial" });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 60 && Number(blocked.headers.get("retry-after")) <= 3600);
    assert.equal(budgetCounters()["recovery-hour:global"].count, 10);
    assert.equal((await api.editableConfiguration()).version, current.version);
    offset = 3601_000;
    assert.equal((await putRecovery({ version: current.version, target: "restore", historyId: "initial" })).status, 200);
    assert.equal(budgetCounters()["recovery-hour:global"].count, 1);
    assert.equal(budgetCounters()["settings:global"], undefined);
  } finally { Date.now = now; }
});

test("初期値と固定控えの復元は全体でも1時間20回までに抑え、拒否時に他の枠を消費しない", async () => {
  const security = load("lib/security.ts");
  security.requestAddress = (req) => security.digestValue("test-address", req.headers.get("x-test-address") || "a");
  const setup = await distinctProtectedRecovery();
  const api = setup.api;
  let current = setup.current;
  const now = Date.now;
  let offset = 0;
  try {
    Date.now = () => now() + offset;
    for (let i = 0; i < 20; i++) {
      offset = Math.floor(i / 10) * 61_000;
      const response = await putRecovery({ version: current.version, target: "restore", historyId: i % 2 === 0 ? "initial" : "baseline" }, { "x-test-address": `hour-source-${i}` });
      assert.equal(response.status, 200);
      current = await response.json();
    }
    offset = 122_000;
    const blocked = await putRecovery({ version: current.version, target: "restore", historyId: "initial" }, { "x-test-address": "unused" });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 60);
    assert.equal(budgetCounters()["recovery-hour:global"].count, 20);
    for (const prefix of ["recovery", "recovery-hour"]) assert.equal(budgetCounters()[`${prefix}:address:${security.digestValue("test-address", "unused")}`], undefined);
    assert.equal((await api.editableConfiguration()).version, current.version);
  } finally { Date.now = now; }
});

test("業務の各入力・規程・マスタの制御文字は保存前に拒否し、履歴と受理枠を変えない", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  const task = initial.tasks[0];
  const master = { id: "reference-control", kind: "reference", name: "架空の資料", filename: "reference.txt", content: "架空の本文" };
  const inputs = Object.keys(taskValues(task)).map((field) => ({ version: initial.version, target: "task", taskId: task.id, values: { ...taskValues(task), [field]: `架空\u0085${field}` } }));
  inputs.push({ version: initial.version, target: "task", taskId: task.id, values: { ...taskValues(task), manual: "\u0001".repeat(50000) } });
  inputs.push({ version: initial.version, target: "rules", expenseRules: "架空の規程\u0001" });
  for (const field of ["id", "kind", "name", "filename", "content"]) inputs.push({ version: initial.version, target: "masters", masters: [{ ...master, [field]: field === "filename" ? "reference\u0085.txt" : `${master[field]}\u0001` }] });
  for (const input of inputs) {
    const response = await putSettings(input);
    assert.equal(response.status, 400);
  }
  assert.equal((await api.editableConfiguration()).version, initial.version);
  assert.deepEqual((await api.editableConfiguration()).history, initial.history);
  assert.equal(budgetCounters()["settings:global"], undefined);
});

test("手順・規程・マスタ本文の通常の改行とタブ、日本語や引用符はそのまま保存できる", async () => {
  const api = load("lib/configuration.ts");
  let current = await api.editableConfiguration();
  const task = current.tasks[0];
  const text = '# 架空の確認\r\n手順1\n\t"日本語,引用符"\r手順2';
  let response = await putSettings({ version: current.version, target: "task", taskId: task.id, values: { ...taskValues(task), manual: text } });
  assert.equal(response.status, 200);
  current = await response.json();
  assert.equal(current.tasks[0].manual, text);
  response = await putSettings({ version: current.version, target: "rules", expenseRules: text });
  assert.equal(response.status, 200);
  current = await response.json();
  assert.equal(current.expenseRules, text);
  response = await putSettings({ version: current.version, target: "masters", masters: [{ id: "reference-text", kind: "reference", name: "架空の資料", filename: "reference.txt", content: text }] });
  assert.equal(response.status, 200);
  current = await response.json();
  assert.equal(current.masters[0].content, text);
  assert.equal(budgetCounters()["settings:global"].count, 3);
});

test("昔の制御文字入り設定は読み込めるが、最近の履歴からの再適用は受理枠を使わず拒否する", async () => {
  const api = load("lib/configuration.ts");
  const store = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  const task = initial.tasks[0];
  await store.securityCommand("set", "configuration:current", JSON.stringify({ revision: "legacy-control", tasks: { [task.id]: { ...taskValues(task), manual: "架空の旧手順\u0001" } }, updatedAt: "2026-11-01T00:00:00.000Z" }), 3600000);
  let current = await api.editableConfiguration();
  assert.equal(current.tasks[0].manual, "架空の旧手順\u0001");
  current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: "架空の新規程" });
  const legacyId = current.history[0].id;
  const reset = await putRecovery({ version: current.version, target: "restore", historyId: "initial" });
  assert.equal(reset.status, 200);
  current = await reset.json();
  const counters = budgetCounters();
  const rejected = await putRecovery({ version: current.version, target: "restore", historyId: legacyId });
  assert.equal(rejected.status, 400);
  assert.equal((await api.editableConfiguration()).version, current.version);
  assert.deepEqual(budgetCounters(), counters);
  // 固定控えの旧本文は互換性を保ち、明示した復旧だけで戻せる。
  const protectedRestore = await putRecovery({ version: current.version, target: "restore", historyId: "baseline" });
  assert.equal(protectedRestore.status, 200);
  assert.equal((await protectedRestore.json()).tasks[0].manual, "架空の旧手順\u0001");
});
