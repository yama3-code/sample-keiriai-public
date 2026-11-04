import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// 実際の環境設定・API・保存先を使わず、サーバーが選ぶ許可範囲だけを確認する。
const require = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const filename = path.join(process.cwd(), relative);
  if (modules.has(filename)) return modules.get(filename).exports;
  const loadedModule = { exports: {} }; modules.set(filename, loadedModule);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
  new Function("require", "module", "exports", source)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { loadUsagePolicy, isAllowedUsageSelection, UsagePolicyError } = load("lib/usage-policy.ts");

test("手元の開発では従来のモデル・エフォート・初期値・処理量を維持する", () => {
  const policy = loadUsagePolicy({ NODE_ENV: "development", ANTHROPIC_MODEL: "claude-fable-5-1" });
  assert.equal(policy.publicMode, false);
  assert.equal(policy.defaultModel, "claude-fable-5-1");
  assert.equal(policy.defaultEffort, "medium");
  assert.equal(policy.models.length, 4);
  assert.equal(policy.efforts.length, 5);
  assert.ok(isAllowedUsageSelection(policy, "claude-fable-5-1", "max"));
  assert.deepEqual([policy.newRunsPerBrowserHour, policy.newRunsPerAddressHour, policy.newRunsPerHour, policy.newRunsPerDay, policy.maxOutputTokens, policy.maxRounds], [5, 5, 10, 30, 32000, 12]);
});

test("公開時は高額モデル・高エフォート・自動切替を許可せず、古い初期モデルにも引きずられない", () => {
  const policy = loadUsagePolicy({ NODE_ENV: "production", ANTHROPIC_MODEL: "claude-fable-5-1" });
  assert.equal(policy.publicMode, true);
  assert.deepEqual(policy.models.map((model) => model.id), ["claude-haiku-5-5", "claude-sonnet-5-5"]);
  assert.deepEqual(policy.efforts.map((effort) => effort.id), ["low", "medium"]);
  assert.equal(policy.defaultModel, "claude-haiku-5-5");
  assert.equal(policy.defaultEffort, "low");
  assert.ok(policy.models.every((model) => !model.fallback));
  assert.ok(isAllowedUsageSelection(policy, "claude-sonnet-5-5", "medium"));
  for (const [model, effort] of [["claude-fable-5-1", "low"], ["claude-opus-5-5", "medium"], ["claude-sonnet-5-5", "max"], ["claude-haiku-5-5", "high"], ["unknown", "low"]]) {
    assert.equal(isAllowedUsageSelection(policy, model, effort), false);
  }
  assert.deepEqual([policy.newRunsPerBrowserHour, policy.newRunsPerAddressHour, policy.newRunsPerHour, policy.newRunsPerDay, policy.maxOutputTokens, policy.maxRounds], [5, 3, 5, 10, 8000, 6]);
  assert.match(policy.notice, /金額の上限ではありません/);
  assert.match(policy.notice, /枠を共有/);
});

test("Vercelのプレビューも公開用に制限し、別のプロセスの設定を変更しない", () => {
  for (const flag of ["1", "0", "false"]) {
    const environment = { NODE_ENV: "development", VERCEL: flag };
    const before = { ...environment };
    assert.equal(loadUsagePolicy(environment).publicMode, true);
    assert.deepEqual(environment, before);
  }
  assert.equal(loadUsagePolicy({ NODE_ENV: "test" }).publicMode, false);
});

test("公開の処理量と初期選択はサーバー環境設定でだけ変更できる", () => {
  const policy = loadUsagePolicy({
    NODE_ENV: "production", PUBLIC_RUNS_PER_HOUR: "8", PUBLIC_RUNS_PER_DAY: "16", PUBLIC_RUNS_PER_BROWSER_HOUR: "4",
    PUBLIC_RUNS_PER_ADDRESS_HOUR: "2", PUBLIC_MAX_OUTPUT_TOKENS: "16000", PUBLIC_MAX_ROUNDS: "8",
    PUBLIC_DEFAULT_MODEL: "claude-sonnet-5-5", PUBLIC_DEFAULT_EFFORT: "medium",
  });
  assert.deepEqual([policy.newRunsPerBrowserHour, policy.newRunsPerAddressHour, policy.newRunsPerHour, policy.newRunsPerDay, policy.maxOutputTokens, policy.maxRounds], [4, 2, 8, 16, 16000, 8]);
  assert.equal(policy.defaultModel, "claude-sonnet-5-5");
  assert.equal(policy.defaultEffort, "medium");
  assert.match(policy.notice, /毎時8回・24時間で16回/);
  assert.equal(loadUsagePolicy({ NODE_ENV: "production", PUBLIC_RUNS_PER_HOUR: "1" }).newRunsPerAddressHour, 1);
});

test("公開設定の入力ミスでは上限を解除せず停止し、設定値自体をエラーに含めない", () => {
  const invalid = {
    PUBLIC_RUNS_PER_HOUR: ["0", "-1", "1.5", "abc", "11", "9007199254740992"],
    PUBLIC_RUNS_PER_DAY: ["31"], PUBLIC_RUNS_PER_BROWSER_HOUR: ["6"], PUBLIC_RUNS_PER_ADDRESS_HOUR: ["6"],
    PUBLIC_MAX_OUTPUT_TOKENS: ["1023", "32001"], PUBLIC_MAX_ROUNDS: ["13"],
    PUBLIC_DEFAULT_MODEL: ["claude-opus-5-5", "unknown-sensitive-setting"], PUBLIC_DEFAULT_EFFORT: ["high", "max"],
  };
  for (const [name, values] of Object.entries(invalid)) for (const value of values) {
    assert.throws(() => loadUsagePolicy({ NODE_ENV: "production", [name]: value }), UsagePolicyError);
  }
  assert.throws(() => loadUsagePolicy({ NODE_ENV: "production", PUBLIC_DEFAULT_MODEL: "unknown-sensitive-setting" }), (error) => {
    assert.doesNotMatch(error.message, /unknown-sensitive-setting/); return true;
  });
});

test("公開用の制限は手元の設定を変更せず、モデル一覧も書き換えない", () => {
  const local = loadUsagePolicy({ NODE_ENV: "development", ANTHROPIC_MODEL: "custom-model", PUBLIC_MAX_ROUNDS: "invalid" });
  assert.equal(local.defaultModel, "custom-model");
  assert.equal(local.models[0].id, "custom-model");
  assert.equal(local.maxRounds, 12);
  loadUsagePolicy({ NODE_ENV: "production" });
  const after = loadUsagePolicy({ NODE_ENV: "development" });
  assert.equal(after.models.find((model) => model.id === "claude-sonnet-5-5").fallback, true);
  assert.equal(after.efforts.length, 5);
});
