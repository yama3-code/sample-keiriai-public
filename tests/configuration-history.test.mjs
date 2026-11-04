import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// 実際の設定やAPIを使わず、一時保存先で履歴と復元の一括更新を確認する。
const require = createRequire(import.meta.url);
const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "keiri-history-test-"));
let cache;
function load(relative) {
  const filename = path.join(root, relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} }; cache.set(filename, loadedModule);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const localRequire = (name) => name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name);
  new Function("require", "module", "exports", source)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
beforeEach(() => {
  process.env.NODE_ENV = "test";
  process.env.SECURITY_LOCAL_DIR = fs.mkdtempSync(path.join(temporary, "store-"));
  delete process.env.VERCEL; delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  cache = new Map();
});
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
const taskValues = ({ name, summary, manual, instructionPlaceholder }) => ({ name, summary, manual, instructionPlaceholder });

test("初回の変更前も履歴に残し、本文は特定の履歴を開いたときだけ返す", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  assert.deepEqual(initial.history, []);
  assert.deepEqual(initial.recovery.map((entry) => entry.id), ["initial"]);
  const task = initial.tasks[0];
  const updated = await api.saveConfiguration({ version: initial.version, target: "task", taskId: task.id, values: { ...taskValues(task), name: "架空の変更業務", manual: `${task.manual}\n追記した手順` } });
  assert.equal(updated.history.length, 2);
  assert.equal(updated.history[0].isCurrent, true);
  assert.equal(updated.history[1].isCurrent, false);
  assert.equal(updated.history[1].savedAt, null);
  assert.equal("snapshot" in updated.history[0], false);
  assert.deepEqual(updated.recovery.map((entry) => entry.id), ["baseline", "initial"]);
  const detail = await api.configurationHistory(updated.history[1].id);
  assert.equal(detail.version, updated.version);
  assert.ok(detail.changes.some((change) => change.after === task.name));
  assert.ok(detail.changes.some((change) => change.after === task.manual));
  assert.equal(detail.changes.some((change) => "snapshot" in change), false);
});

test("マスタ削除を通常読込で復活させず、明示的な履歴復元でだけ元に戻す", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  const deleted = await api.saveConfiguration({ version: initial.version, target: "masters", masters: [] });
  const originalId = deleted.history[1].id;
  assert.deepEqual((await api.loadConfiguration()).masters, []);
  const detail = await api.configurationHistory(originalId);
  assert.equal(detail.changes.filter((change) => change.label.startsWith("共通データ：")).length, initial.masters.length);
  const restored = await api.saveConfiguration({ version: deleted.version, target: "restore", historyId: originalId });
  assert.deepEqual(restored.masters, initial.masters);
  assert.notEqual(restored.version, deleted.version);
  assert.deepEqual(restored.history.map((entry) => entry.id), deleted.history.map((entry) => entry.id));
  assert.equal(restored.history.find((entry) => entry.id === originalId).isCurrent, true);
  assert.deepEqual((await api.loadConfiguration()).masters, initial.masters);
  const undoRestore = await api.saveConfiguration({ version: restored.version, target: "restore", historyId: deleted.history[0].id });
  assert.deepEqual(undoRestore.masters, []);
});

test("古い版・存在しない履歴・改変した復元本文は保存枠を消費する前に拒否する", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  const changed = await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の新しい規程" });
  const id = changed.history[1].id;
  let accepted = 0;
  const beforeSave = async () => { accepted++; };
  await assert.rejects(api.saveConfiguration({ version: initial.version, target: "restore", historyId: id }, beforeSave), { status: 409 });
  await assert.rejects(api.saveConfiguration({ version: changed.version, target: "restore", historyId: "0".repeat(64) }, beforeSave), { status: 404 });
  await assert.rejects(api.saveConfiguration({ version: changed.version, target: "restore", historyId: id, snapshot: { masters: [] } }, beforeSave), { status: 400 });
  await assert.rejects(api.saveConfiguration({ version: changed.version, target: "restore", historyId: changed.history[0].id }, beforeSave), { status: 400 });
  assert.equal(accepted, 0);
  const restored = await api.saveConfiguration({ version: changed.version, target: "restore", historyId: id }, beforeSave);
  assert.equal(accepted, 1);
  assert.equal(restored.expenseRules, initial.expenseRules);
});

test("同時保存は設定と履歴がまとめて一方だけ残り、拒否された変更の履歴は作らない", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  let arrivals = 0; let release;
  const ready = new Promise((resolve) => { release = resolve; });
  const beforeSave = async () => { if (++arrivals === 2) release(); await ready; };
  const outcomes = await Promise.allSettled(["架空の規程A", "架空の規程B"].map((expenseRules) => api.saveConfiguration({ version: initial.version, target: "rules", expenseRules }, beforeSave)));
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.find((outcome) => outcome.status === "rejected").reason.status, 409);
  const current = await api.editableConfiguration();
  assert.equal(current.history.length, 2);
  assert.equal(current.history.filter((entry) => entry.isCurrent).length, 1);
  assert.deepEqual((await api.configurationHistory(current.history[0].id)).changes, []);
  assert.ok(["架空の規程A", "架空の規程B"].includes(current.expenseRules));
});

test("旧形式の保存内容から移行し、最新10版を超えた履歴は復元できない", async () => {
  const { securityCommand } = load("lib/security-store.ts");
  await securityCommand("set", "configuration:current", JSON.stringify({ revision: "legacy", tasks: {}, expenseRules: "架空の旧形式の規程", updatedAt: "2026-11-01T00:00:00.000Z" }), 3600000);
  const api = load("lib/configuration.ts");
  let current = await api.editableConfiguration();
  assert.equal(current.expenseRules, "架空の旧形式の規程");
  assert.deepEqual(current.history, []);
  let oldId;
  for (let i = 0; i < 12; i++) {
    current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: `架空の規程第${i + 1}版` });
    oldId ??= current.history[1].id;
  }
  assert.equal(current.history.length, 10);
  await assert.rejects(api.configurationHistory(oldId), { status: 404 });
  const previous = await api.configurationHistory(current.history[1].id);
  assert.ok(previous.changes.some((change) => change.after.includes("架空の規程第11版")));
});

test("大きな内容は容量に合わせて古い履歴から取り除き、直近の復元先を残す", async () => {
  const api = load("lib/configuration.ts");
  let current = await api.editableConfiguration();
  const initial = current;
  for (const task of current.tasks) current = await api.saveConfiguration({ version: current.version, target: "task", taskId: task.id, values: { ...taskValues(task), manual: "架".repeat(50000) } });
  const masters = [1, 2, 3].map((id) => ({ id: `reference-${id}`, kind: "reference", name: `架空の資料${id}`, filename: `reference-${id}.txt`, content: "架".repeat(50000) }));
  current = await api.saveConfiguration({ version: current.version, target: "masters", masters });
  for (let i = 0; i < 8; i++) {
    const task = current.tasks[0];
    current = await api.saveConfiguration({ version: current.version, target: "task", taskId: task.id, values: { ...taskValues(task), summary: `架空の変更${i}` } });
  }
  assert.ok(current.history.length < 10);
  assert.ok(current.history.length >= 2);
  const detail = await api.configurationHistory(current.history[1].id);
  assert.ok(detail.changes.some((change) => change.label.endsWith("説明")));
  const raw = JSON.parse(await load("lib/security-store.ts").securityCommand("get", "configuration:current"));
  assert.ok(Buffer.byteLength(JSON.stringify(raw.history), "utf8") <= 4_000_000);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(JSON.stringify(raw))), "utf8") <= 4_000_000);
  assert.deepEqual(raw.protectedBaseline.snapshot, { tasks: initial.tasks, masters: initial.masters });
  const restored = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "baseline" });
  assert.deepEqual(restored.tasks, initial.tasks);
  assert.deepEqual(restored.masters, initial.masters);
});

test("壊れた履歴を捨てて上書きせず、安全確認エラーとして停止する", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の規程" });
  const { securityCommand } = load("lib/security-store.ts");
  const stored = JSON.parse(await securityCommand("get", "configuration:current"));
  stored.history[0].snapshot.masters = [{ id: "broken" }];
  await securityCommand("set", "configuration:current", JSON.stringify(stored), 3600000);
  await assert.rejects(api.editableConfiguration(), { name: "Error" });
});

test("引用符や斜線の多い本文でもCASの旧版・新版・外側JSONを含む送信容量に収まる", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  let current = await api.editableConfiguration();
  const masters = [1, 2].map((id) => ({ id: `quoted-${id}`, kind: "reference", name: `架空の記号資料${id}`, filename: `quoted-${id}.txt`, content: '\\"\n'.repeat(16000) }));
  current = await api.saveConfiguration({ version: current.version, target: "masters", masters });
  let before;
  for (let i = 0; i < 8; i++) {
    before = await securityCommand("get", "configuration:current");
    current = await api.saveConfiguration({ version: current.version, target: "task", taskId: current.tasks[0].id, values: { ...taskValues(current.tasks[0]), summary: `架空の記号変更${i}` } });
  }
  assert.ok(current.history.length < 10);
  assert.ok(current.history.length >= 2);
  const after = await securityCommand("get", "configuration:current");
  const command = ["EVAL", "確認用のスクリプト".repeat(100), "1", "確認用の保存キー", "cas", JSON.stringify({ expected: before, value: after }), "1"];
  assert.ok(Buffer.byteLength(JSON.stringify(command), "utf8") < 9_000_000);
  assert.ok((await api.configurationHistory(current.history[1].id)).changes.length > 0);
});

test("通常履歴から最初の版が消えても、固定した控えは保存と復元を重ねて保持する", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  let current = initial;
  let oldId;
  let protectedBaseline;
  for (let i = 0; i < 12; i++) {
    current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: `架空の規程第${i + 1}版` });
    oldId ??= current.history[1].id;
    protectedBaseline ??= JSON.parse(await securityCommand("get", "configuration:current")).protectedBaseline;
  }
  await assert.rejects(api.configurationHistory(oldId), { status: 404 });
  const detail = await api.configurationHistory("baseline");
  assert.equal(detail.entry.id, "baseline");
  assert.ok(detail.changes.some((change) => change.after.includes(initial.expenseRules)));
  current = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "baseline" });
  assert.deepEqual(current.tasks, initial.tasks);
  assert.deepEqual(current.masters, initial.masters);
  assert.deepEqual(JSON.parse(await securityCommand("get", "configuration:current")).protectedBaseline, protectedBaseline);
});

test("初期値の復元は明示した場合だけ行い、通常読込や変更では削除済みマスタを補わない", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  let current = await api.saveConfiguration({ version: initial.version, target: "masters", masters: [] });
  const task = current.tasks[0];
  current = await api.saveConfiguration({ version: current.version, target: "task", taskId: task.id, values: { ...taskValues(task), manual: "架空の新しい手順" } });
  const preview = await api.configurationHistory("initial");
  assert.equal(preview.entry.id, "initial");
  assert.equal(preview.version, current.version);
  assert.deepEqual((await api.loadConfiguration()).masters, []);
  assert.equal(preview.changes.filter((change) => change.label.startsWith("共通データ：")).length, initial.masters.length);
  const restored = await api.saveConfiguration({ version: preview.version, target: "restore", historyId: "initial" });
  assert.deepEqual(restored.tasks, initial.tasks);
  assert.deepEqual(restored.masters, initial.masters);
  assert.deepEqual(restored.history.map((entry) => entry.id), current.history.map((entry) => entry.id));
  assert.equal(restored.recovery.find((entry) => entry.id === "initial").isCurrent, true);
  await assert.rejects(api.saveConfiguration({ version: restored.version, target: "restore", historyId: "initial" }), { status: 400 });
});

test("旧履歴がある設定は残っている最古版を固定し、以後の保存で差し替えない", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  let current = await api.editableConfiguration();
  current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: "架空の最古の残存規程" });
  current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: "架空の移行直前の規程" });
  const legacy = JSON.parse(await securityCommand("get", "configuration:current"));
  delete legacy.protectedBaseline;
  legacy.history.pop();
  const oldest = legacy.history.at(-1);
  await securityCommand("set", "configuration:current", JSON.stringify(legacy), 3600000);
  current = await api.editableConfiguration();
  assert.deepEqual(current.recovery.map((entry) => entry.id), ["initial"]);
  current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: "架空の移行後の規程" });
  assert.deepEqual(JSON.parse(await securityCommand("get", "configuration:current")).protectedBaseline, oldest);
  current = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "initial" });
  assert.deepEqual(JSON.parse(await securityCommand("get", "configuration:current")).protectedBaseline, oldest);
});

test("予約された復元先の偽造・本文差替え・古い版を保存枠の消費前に拒否する", async () => {
  const api = load("lib/configuration.ts");
  const initial = await api.editableConfiguration();
  await assert.rejects(api.configurationHistory("baseline"), { status: 404 });
  let accepted = 0;
  const beforeSave = async () => { accepted++; };
  const current = await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の新しい規程" });
  for (const historyId of ["INITIAL", "initial/", "baselines", "../initial", ""]) {
    await assert.rejects(api.configurationHistory(historyId), { status: 400 });
    await assert.rejects(api.saveConfiguration({ version: current.version, target: "restore", historyId }, beforeSave), { status: 400 });
  }
  for (const historyId of ["initial", "baseline"]) {
    await assert.rejects(api.saveConfiguration({ version: initial.version, target: "restore", historyId }, beforeSave), { status: 409 });
    await assert.rejects(api.saveConfiguration({ version: current.version, target: "restore", historyId, snapshot: { masters: [] } }, beforeSave), { status: 400 });
    await assert.rejects(api.saveConfiguration({ version: current.version, target: "restore", historyId, protectedBaseline: null }, beforeSave), { status: 400 });
  }
  assert.equal(accepted, 0);
});

test("固定した控えの形式破損や業務構成の不一致を黙って補わず拒否する", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の規程" });
  const stored = JSON.parse(await securityCommand("get", "configuration:current"));
  stored.protectedBaseline.snapshot.tasks.pop();
  await securityCommand("set", "configuration:current", JSON.stringify(stored), 3600000);
  let current = await api.editableConfiguration();
  await assert.rejects(api.configurationHistory("baseline"), { status: 409 });
  await assert.rejects(api.saveConfiguration({ version: current.version, target: "restore", historyId: "baseline" }), { status: 409 });
  stored.protectedBaseline.snapshot.masters = [{ id: "broken" }];
  await securityCommand("set", "configuration:current", JSON.stringify(stored), 3600000);
  await assert.rejects(api.editableConfiguration(), { name: "Error" });
});

test("控えを含めた送信容量を超える保存は拒否し、固定した控えを削って通さない", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  const saved = await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の規程" });
  const stored = JSON.parse(await securityCommand("get", "configuration:current"));
  const largeTasks = initial.tasks.map((task) => ({ ...task, manual: "\\".repeat(50000) }));
  const largeMasters = [1, 2, 3].map((id) => ({ id: `large-${id}`, kind: "reference", name: `架空の記号資料${id}`, filename: `large-${id}.txt`, content: "\\".repeat(50000) }));
  stored.protectedBaseline.snapshot = { tasks: largeTasks, masters: largeMasters };
  stored.tasks = Object.fromEntries(saved.tasks.map(({ id, ...values }) => [id, values]));
  stored.masters = saved.masters;
  delete stored.currentSnapshot;
  stored.history = [];
  const before = JSON.stringify(stored);
  await securityCommand("set", "configuration:current", before, 3600000);
  const current = await api.editableConfiguration();
  let accepted = 0;
  await assert.rejects(api.saveConfiguration({ version: current.version, target: "masters", masters: largeMasters }, async () => { accepted++; }), { status: 400 });
  assert.equal(accepted, 0);
  assert.equal(await securityCommand("get", "configuration:current"), before);
});

test("旧版で保存できた大きな控えは、既存履歴への参照で履歴を失わず復元できる", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  const snapshot = {
    tasks: initial.tasks.map((task) => ({ ...task, manual: '"'.repeat(24000) })),
    masters: [1, 2, 3].map((id) => ({ id: `quoted-${id}`, kind: "reference", name: `架空の記号資料${id}`, filename: `quoted-${id}.txt`, content: '"'.repeat(30000) })),
  };
  const oldEntry = { id: "a".repeat(64), savedAt: "2026-11-01T00:00:00.000Z", description: "架空の旧版保存", snapshot };
  // 旧実装は現在の設定と最新履歴を同じ内容で保存しており、この大きさも許可されていた。
  const legacy = { revision: oldEntry.id, tasks: Object.fromEntries(snapshot.tasks.map(({ id, ...values }) => [id, values])), masters: snapshot.masters, updatedAt: oldEntry.savedAt, history: [oldEntry] };
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(JSON.stringify(legacy))), "utf8") < 4_000_000);
  await securityCommand("set", "configuration:current", JSON.stringify(legacy), 3600000);
  let current = await api.editableConfiguration();
  current = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "initial" });
  let stored = JSON.parse(await securityCommand("get", "configuration:current"));
  assert.deepEqual(stored.protectedBaseline, oldEntry);
  const before = JSON.stringify(stored);
  current = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "baseline" });
  stored = JSON.parse(await securityCommand("get", "configuration:current"));
  assert.deepEqual(current.tasks, snapshot.tasks);
  assert.deepEqual(current.masters, snapshot.masters);
  assert.deepEqual(stored.protectedBaseline, oldEntry);
  assert.equal(stored.currentSnapshot, "baseline");
  assert.deepEqual(stored.tasks, {});
  assert.equal(stored.masters, undefined);
  assert.deepEqual(stored.history, [oldEntry]);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(JSON.stringify(stored))), "utf8") < 4_000_000);
  const command = ["EVAL", "確認用のスクリプト".repeat(100), "1", "確認用の保存キー", "cas", JSON.stringify({ expected: before, value: JSON.stringify(stored) }), "1"];
  assert.ok(Buffer.byteLength(JSON.stringify(command), "utf8") < 9_000_000);
  // 通常編集では履歴に新しい本文を残し、現在本文はその履歴を参照する。
  current = await api.saveConfiguration({ version: current.version, target: "task", taskId: current.tasks[0].id, values: { ...taskValues(current.tasks[0]), summary: "架空の容量確認" } });
  stored = JSON.parse(await securityCommand("get", "configuration:current"));
  assert.equal(current.history.length, 1);
  assert.deepEqual(stored.currentSnapshot, { historyId: current.history[0].id });
  assert.deepEqual(stored.protectedBaseline, oldEntry);
  // 次の復元でも、控えを現在内容から取り直さない。
  current = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "initial" });
  assert.deepEqual(JSON.parse(await securityCommand("get", "configuration:current")).protectedBaseline, oldEntry);
});

test("現行4業務とマスタの文字数上限まである旧設定でも、初期値と固定控えの間を復元できる", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  const control = "\u0001";
  const snapshot = {
    tasks: initial.tasks.map((task) => ({ ...task, name: `架空${control.repeat(98)}`, summary: control.repeat(1000), manual: control.repeat(50000), instructionPlaceholder: control.repeat(2000) })),
    masters: Array.from({ length: 20 }, (_, index) => ({ id: `maximum-${index}`, kind: "reference", name: `架空${control.repeat(98)}`, filename: `${'"'.repeat(200)}.txt`, content: control.repeat(7500) })),
  };
  // 改行等よりJSON化で膨らむ制御文字を使い、履歴導入前の形式からの復旧も確認する。
  const legacy = { revision: "b".repeat(64), tasks: Object.fromEntries(snapshot.tasks.map(({ id, ...values }) => [id, values])), masters: snapshot.masters, updatedAt: "2026-11-01T00:00:00.000Z" };
  await securityCommand("set", "configuration:current", JSON.stringify(legacy), 3600000);
  const current = await api.editableConfiguration();
  let restored = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "initial" });
  assert.deepEqual(restored.tasks, initial.tasks);
  assert.deepEqual(restored.masters, initial.masters);
  let stored = JSON.parse(await securityCommand("get", "configuration:current"));
  assert.deepEqual(stored.protectedBaseline.snapshot, snapshot);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(JSON.stringify(stored))), "utf8") < 4_000_000);
  restored = await api.saveConfiguration({ version: restored.version, target: "restore", historyId: "baseline" });
  assert.deepEqual(restored.tasks, snapshot.tasks);
  assert.deepEqual(restored.masters, snapshot.masters);
  assert.deepEqual((await api.loadConfiguration()).masters, snapshot.masters);
  assert.deepEqual(restored.history, []);
  stored = JSON.parse(await securityCommand("get", "configuration:current"));
  assert.equal(stored.currentSnapshot, "baseline");
  assert.deepEqual(stored.tasks, {});
  assert.equal(stored.masters, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(JSON.stringify(stored))), "utf8") < 4_000_000);
  restored = await api.saveConfiguration({ version: restored.version, target: "restore", historyId: "initial" });
  assert.deepEqual(restored.tasks, initial.tasks);
  assert.deepEqual(restored.masters, initial.masters);
  assert.deepEqual(JSON.parse(await securityCommand("get", "configuration:current")).protectedBaseline.snapshot, snapshot);
});

test("固定控えへの参照は正本から展開し、未知参照・本文混在・参照先欠落・公開本文での偽造を拒否する", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  let current = await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の変更後の規程" });
  current = await api.saveConfiguration({ version: current.version, target: "restore", historyId: "baseline" });
  const valid = JSON.parse(await securityCommand("get", "configuration:current"));
  assert.equal(valid.currentSnapshot, "baseline");
  assert.deepEqual(current.tasks, initial.tasks);
  let accepted = 0;
  const beforeSave = async () => { accepted++; };
  await assert.rejects(api.saveConfiguration({ version: current.version, target: "restore", historyId: "initial", currentSnapshot: "baseline" }, beforeSave), { status: 400 });
  await assert.rejects(api.saveConfiguration({ version: current.version, target: "task", taskId: current.tasks[0].id, values: taskValues(current.tasks[0]), currentSnapshot: "baseline" }, beforeSave), { status: 400 });
  assert.equal(accepted, 0);
  const missing = { ...valid }; delete missing.protectedBaseline;
  for (const broken of [
    { ...valid, currentSnapshot: "initial" }, { ...valid, currentSnapshot: null }, missing,
    { ...valid, masters: [] }, { ...valid, expenseRules: "架空の混在規程" },
    { ...valid, tasks: { [initial.tasks[0].id]: taskValues(initial.tasks[0]) } },
  ]) {
    await securityCommand("set", "configuration:current", JSON.stringify(broken), 3600000);
    await assert.rejects(api.editableConfiguration(), { name: "Error" });
    await assert.rejects(api.loadConfiguration(), { name: "Error" });
  }
});

test("正しい4改訂を交互に10回復元しても、履歴の本文・ID・順序を変えない", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  let current = await api.editableConfiguration();
  for (let i = 1; i <= 4; i++) current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: `架空の正しい改訂${i}` });
  const before = JSON.parse(await securityCommand("get", "configuration:current"));
  const targets = [current.history[1].id, current.history[0].id];
  for (let i = 0; i < 10; i++) {
    const version = current.version;
    const historyId = targets[i % 2];
    current = await api.saveConfiguration({ version, target: "restore", historyId });
    assert.notEqual(current.version, version);
    assert.deepEqual(current.history.filter((entry) => entry.isCurrent).map((entry) => entry.id), [historyId]);
    const stored = JSON.parse(await securityCommand("get", "configuration:current"));
    assert.deepEqual(stored.history, before.history);
    assert.deepEqual(stored.protectedBaseline, before.protectedBaseline);
    assert.deepEqual(stored.currentSnapshot, { historyId });
  }
  for (const entry of before.history) assert.equal((await api.configurationHistory(entry.id)).entry.id, entry.id);
});

test("初期値と初期値とは異なる固定控えを往復しても、最近の正しい履歴を押し出さない", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  await securityCommand("set", "configuration:current", JSON.stringify({ revision: "legacy", tasks: {}, expenseRules: "架空の固定した規程", updatedAt: "2026-11-01T00:00:00.000Z" }), 3600000);
  let current = await api.editableConfiguration();
  for (let i = 1; i <= 4; i++) current = await api.saveConfiguration({ version: current.version, target: "rules", expenseRules: `架空の正しい改訂${i}` });
  const before = JSON.parse(await securityCommand("get", "configuration:current"));
  for (let i = 0; i < 12; i++) {
    const historyId = i % 2 === 0 ? "initial" : "baseline";
    current = await api.saveConfiguration({ version: current.version, target: "restore", historyId });
    const stored = JSON.parse(await securityCommand("get", "configuration:current"));
    assert.deepEqual(stored.history, before.history);
    assert.deepEqual(stored.protectedBaseline, before.protectedBaseline);
    assert.deepEqual((await api.configurationHistory(historyId)).changes, []);
  }
});

test("大きな新規保存でも初期値・固定控え・最近の版へ履歴を減らさずに戻せる", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  await securityCommand("set", "configuration:current", JSON.stringify({ revision: "legacy", tasks: {}, expenseRules: "架空の保護した規程", updatedAt: "2026-11-01T00:00:00.000Z" }), 3600000);
  let current = await api.editableConfiguration();
  for (const task of current.tasks) current = await api.saveConfiguration({ version: current.version, target: "task", taskId: task.id, values: { ...taskValues(task), manual: '"'.repeat(50000) } });
  const masters = [1, 2, 3].map((id) => ({ id: `quoted-${id}`, kind: "reference", name: `架空の資料${id}`, filename: `quoted-${id}.txt`, content: '"'.repeat(50000) }));
  current = await api.saveConfiguration({ version: current.version, target: "masters", masters });
  const before = JSON.parse(await securityCommand("get", "configuration:current"));
  const largeId = current.history[0].id;
  for (const historyId of ["initial", "baseline", largeId, "initial", largeId]) {
    const oldRaw = await securityCommand("get", "configuration:current");
    current = await api.saveConfiguration({ version: current.version, target: "restore", historyId });
    const raw = await securityCommand("get", "configuration:current");
    const stored = JSON.parse(raw);
    assert.deepEqual(stored.history, before.history);
    assert.deepEqual(stored.protectedBaseline, before.protectedBaseline);
    assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify(raw)), "utf8") < 4_000_000);
    assert.ok(Buffer.byteLength(JSON.stringify(JSON.stringify({ expected: oldRaw, value: raw })), "utf8") < 9_000_000);
  }
});

test("最近の履歴への参照も正本から展開し、参照先欠落や余計な指定では停止する", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  const changed = await api.saveConfiguration({ version: initial.version, target: "rules", expenseRules: "架空の参照先の規程" });
  const valid = JSON.parse(await securityCommand("get", "configuration:current"));
  assert.deepEqual(valid.currentSnapshot, { historyId: changed.history[0].id });
  assert.deepEqual((await api.loadConfiguration()).masters, changed.masters);
  for (const currentSnapshot of [{ historyId: "0".repeat(64) }, { historyId: "baseline" }, { historyId: valid.currentSnapshot.historyId, snapshot: {} }, {}, []]) {
    await securityCommand("set", "configuration:current", JSON.stringify({ ...valid, currentSnapshot }), 3600000);
    await assert.rejects(api.editableConfiguration(), { name: "Error" });
    await assert.rejects(api.loadConfiguration(), { name: "Error" });
  }
  await securityCommand("set", "configuration:current", JSON.stringify({ ...valid, history: [] }), 3600000);
  await assert.rejects(api.editableConfiguration(), { name: "Error" });
});

test("復旧容量を予約していない旧記録の復元が収まらない場合も、履歴を勝手に削らない", async () => {
  const api = load("lib/configuration.ts");
  const { securityCommand } = load("lib/security-store.ts");
  const initial = await api.editableConfiguration();
  const minimal = { tasks: initial.tasks.map((task) => ({ ...task, name: "架空", summary: "", manual: "架空", instructionPlaceholder: "" })), masters: [] };
  const makeStored = (length) => ({
    revision: "c".repeat(64), tasks: Object.fromEntries(minimal.tasks.map(({ id, ...values }) => [id, values])), masters: [], updatedAt: "2026-11-01T00:00:00.000Z",
    protectedBaseline: { id: "d".repeat(64), savedAt: null, description: "架空の固定控え", snapshot: minimal },
    history: ["e", "f"].map((id) => ({ id: id.repeat(64), savedAt: "2026-11-01T00:00:00.000Z", description: `架空の大きい旧版${id}`, snapshot: {
      tasks: initial.tasks.map((task) => ({ ...task, summary: `架空の旧版${id}`, manual: '"'.repeat(50000) })),
      masters: [{ id: "quoted-reference", kind: "reference", name: "架空の記号資料", filename: "quoted-reference.txt", content: '"'.repeat(length) }],
    } })),
  });
  const wireSize = (value) => Buffer.byteLength(JSON.stringify(JSON.stringify(JSON.stringify(value))), "utf8");
  let lower = 0; let upper = 50000;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (wireSize(makeStored(middle)) <= 3_999_000) lower = middle;
    else upper = middle - 1;
  }
  const legacy = makeStored(lower);
  assert.ok(wireSize(legacy) > 3_990_000 && wireSize(legacy) <= 4_000_000);
  const before = JSON.stringify(legacy);
  await securityCommand("set", "configuration:current", before, 3600000);
  const current = await api.editableConfiguration();
  let accepted = 0;
  await assert.rejects(api.saveConfiguration({ version: current.version, target: "restore", historyId: "initial" }, async () => { accepted++; }), { status: 400 });
  assert.equal(accepted, 0);
  assert.equal(await securityCommand("get", "configuration:current"), before);
});
