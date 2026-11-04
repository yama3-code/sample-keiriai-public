// UI確認専用。APIは全て模擬し、環境設定・実際のClaude APIを使わない。
// npm run dev の起動後に node tests/browser-mock-server.mjs を実行し、localhost:3100 を開く。
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "keiri-ui-mock-"));
process.env.NODE_ENV = "test"; process.env.ANTHROPIC_API_KEY = "dummy-not-sent";
process.env.SECURITY_LOCAL_DIR = temp;
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; delete process.env.VERCEL;
let files = 0; let results = 0;
class MockAnthropic {
  constructor() {
    this.files = { upload: async () => ({ id: `file_mock_${++files}` }), delete: async () => ({}), retrieveMetadata: async (id) => ({ id, expires_at: new Date(Date.now() + 7200000).toISOString() }) };
    this.beta = { messages: { stream(options) {
      const followup = options.messages.some((m) => Array.isArray(m.content) && m.content.some((b) => b.text?.startsWith("追加依頼：")));
      const answered = options.messages.at(-1).content?.some?.((b) => b.type === "tool_result" && b.tool_use_id === "question_mock");
      const ask = followup && !answered;
      const input = { summary: `第${results + 1}回の模擬集計です。`, report: `## ${results ? "追加の確認結果" : "最初の集計結果"}\n元の資料に基づく模擬結果です。`, tables: [{ name: "部門別内訳", columns: ["部門", "交通費"], rows: [["営業部", String((results + 1) * 100)]] }], entries: [{ voucher_no: `MOCK-${results + 1}`, date: "2026-11-03", debit_code: "6140", debit_account: "旅費交通費", debit_department: "営業部", debit_amount: (results + 1) * 100, credit_code: "2120", credit_account: "未払金", credit_department: "", credit_amount: (results + 1) * 100, memo: "架空のUI確認" }], steps: [{ title: "模擬確認", result: "資料を確認しました。" }], issues: [] };
      const reply = { content: [ask ? { type: "tool_use", name: "ask_user", id: "question_mock", input: { question: "交通費だけを対象にしますか？", options: ["交通費だけ", "全ての経費"] } } : { type: "tool_use", name: "submit_result", id: `result_mock_${++results}`, input }], stop_reason: "tool_use", container: { id: "container_mock", expires_at: new Date(Date.now() + 7200000).toISOString() } };
      return { async *[Symbol.asyncIterator]() {}, finalMessage: async () => reply };
    } } };
  }
}
for (const name of ["AuthenticationError", "NotFoundError", "RateLimitError", "BadRequestError"]) MockAnthropic[name] = class extends Error {};
const cache = new Map();
function load(relative) {
  const filename = path.resolve(relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (name) => name === "server-only" ? {} : name === "@anthropic-ai/sdk" ? { __esModule: true, default: MockAnthropic, toFile: async (data, name, opts) => new File([data], name, opts) } : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
  new Function("require", "module", "exports", compiled)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const routes = { "/api/run": "app/api/run/route.ts", "/api/settings": "app/api/settings/route.ts", "/api/settings/recovery": "app/api/settings/recovery/route.ts", "/api/uploads": "app/api/uploads/route.ts", "/api/conversation/end": "app/api/conversation/end/route.ts" };
const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      const route = routes[new URL(req.url, "http://localhost:3100").pathname]; if (!route) { res.writeHead(404); res.end(); return; }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      let body = Buffer.concat(chunks); let headers = req.headers;
      if (req.url === "/api/run") {
        const form = await new Response(body, { headers: { "content-type": headers["content-type"] } }).formData();
        if (form.has("configurationVersion")) form.set("configurationVersion", (await load("lib/configuration.ts").loadConfiguration()).version);
        const request = new Request("http://localhost:3100/api/run", { method: "POST", body: form });
        body = Buffer.from(await request.arrayBuffer()); headers = { ...headers, "content-type": request.headers.get("content-type") };
      }
      const request = new Request(`http://localhost:3100${req.url}`, { method: req.method, headers: Object.fromEntries(Object.entries(headers).filter(([,v]) => typeof v === "string")), ...(req.method !== "GET" ? { body } : {}) });
      const response = await load(route)[req.method](request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) for await (const part of response.body) res.write(part);
      res.end(); return;
    }
    const upstream = http.request({ hostname: "localhost", port: 3000, path: req.url, method: req.method, headers: { ...req.headers, host: "localhost:3000" } }, (response) => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    upstream.on("error", () => { res.writeHead(502); res.end("npm run dev を起動してください"); }); req.pipe(upstream);
  } catch (error) { console.error(error.message); res.writeHead(500); res.end("模擬サーバーのエラー"); }
});
server.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(3000, "localhost", () => {
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries({ ...req.headers, host: "localhost:3000" }).map(([k,v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream); upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy()); socket.on("error", () => upstream.destroy());
});
server.listen(3100, "127.0.0.1", () => console.log("模擬UI確認: http://localhost:3100（実APIは使用しません）"));
process.on("SIGINT", () => server.close(() => { fs.rmSync(temp, { recursive: true, force: true }); process.exit(); }));
