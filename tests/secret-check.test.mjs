import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { inspectSecretText, scanRepository } from "../scripts/check-secrets.mjs";

// 実際の鍵は使わず、テスト中だけ組み立てた架空の文字列を使う。
const fakeKey = ["sk", "ant", "api03", "x".repeat(40)].join("-");
const script = path.resolve("scripts/check-secrets.mjs");
const hooks = path.resolve(".githooks");
function repository(run) {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "keiri-secret-check-"));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.name", "架空のテスト担当");
    git("config", "user.email", "test@example.invalid");
    run({ cwd, git, write: (name, text) => writeFileSync(path.join(cwd, name), text) });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

test("Claude・GitHub・秘密鍵・公開用の秘密変数を検出する", () => {
  for (const value of [fakeKey, "ghp" + "_" + "x".repeat(36), ["-----BEGIN", "PRIVATE KEY-----"].join(" "), ["NEXT_PUBLIC", "ANTHROPIC_API_KEY"].join("_")]) {
    assert.ok(inspectSecretText("sample.txt", value).length > 0);
  }
  assert.deepEqual(inspectSecretText("sample.ts", "process.env.ANTHROPIC_API_KEY"), []);
});

test("見本の秘密設定は空欄だけ許し、形式が未知の固定トークンも拒否する", () => {
  assert.deepEqual(inspectSecretText(".env.example", "ANTHROPIC_API_KEY=\nUPSTASH_REDIS_REST_TOKEN=\n"), []);
  assert.ok(inspectSecretText(".env.example", "ANTHROPIC_API_KEY=not-a-real-value").length);
  assert.ok(inspectSecretText("sample.ts", 'UPSTASH_REDIS_REST_TOKEN = "' + "z".repeat(40) + '"').length);
});

test("無視された環境設定は対象外だが、強制追加した場合は内容を読まず拒否する", () => repository(({ cwd, git, write }) => {
  write(".gitignore", ".env*\n!.env.example\n");
  write(".env.local", fakeKey);
  write(".env.example", "ANTHROPIC_API_KEY=\n");
  assert.deepEqual(scanRepository(cwd).issues, []);
  git("add", ".gitignore", ".env.example");
  assert.deepEqual(scanRepository(cwd, "staged").issues, []);
  git("add", "-f", ".env.local");
  assert.ok(scanRepository(cwd, "staged").issues.some((issue) => issue.path === ".env.local"));
  mkdirSync(path.join(cwd, ".guide-build"));
  write(".guide-build/index.html", "架空の生成物");
  git("add", "-f", ".guide-build/index.html");
  assert.ok(scanRepository(cwd, "staged").issues.some((issue) => issue.path === ".guide-build/index.html"));
}));

test("コミット前は作業中の内容ではなく、実際に保存される追加済み内容を検査する", () => repository(({ cwd, git, write }) => {
  write("sample.txt", fakeKey);
  git("add", "sample.txt");
  write("sample.txt", "安全な文章");
  assert.deepEqual(scanRepository(cwd).issues, []);
  assert.ok(scanRepository(cwd, "staged").issues.length);
  git("add", "sample.txt");
  write("sample.txt", fakeKey);
  assert.deepEqual(scanRepository(cwd, "staged").issues, []);
  assert.ok(scanRepository(cwd).issues.length);
}));

test("現在のファイルから消えていても、過去の本文とコミットの説明に残る秘密を検出する", () => repository(({ cwd, git, write }) => {
  write("sample.txt", fakeKey);
  git("add", "."); git("commit", "-qm", "架空の検出対象");
  write("sample.txt", "安全な文章");
  git("add", "."); git("commit", "-qm", fakeKey);
  assert.deepEqual(scanRepository(cwd, "staged").issues, []);
  const issues = scanRepository(cwd, "history").issues;
  assert.ok(issues.some((issue) => issue.path === "sample.txt"));
  assert.ok(issues.some((issue) => issue.path.startsWith("コミット ")));
}));

test("実際のコミットフックが秘密入りの保存を止め、出力へ値を表示しない", () => repository(({ cwd, git, write }) => {
  mkdirSync(path.join(cwd, "scripts"));
  copyFileSync(script, path.join(cwd, "scripts/check-secrets.mjs"));
  git("config", "core.hooksPath", hooks);
  write("sample.txt", fakeKey);
  git("add", ".");
  const result = spawnSync("git", ["commit", "-qm", "架空の検出対象"], { cwd, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /秘密情報の検査で停止/);
  assert.equal((result.stdout + result.stderr).includes(fakeKey), false);
  write("sample.txt", "安全な文章"); git("add", ".");
  git("commit", "-qm", "安全な検査用の保存");
}));

test("検査対象がGitでなければ検査成功として扱わず停止する", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "keiri-not-git-"));
  try {
    const result = spawnSync(process.execPath, [script, "--history"], { cwd, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /検査を完了できないため停止/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
