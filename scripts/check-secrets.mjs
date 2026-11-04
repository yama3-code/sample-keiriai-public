import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 値や該当行は表示しない。環境設定の実ファイルも読み込まず、Git対象だけを検査する。
const patterns = [
  ["ClaudeのAPIキー", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["GitHubのトークン", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/],
  ["その他のAPIキー", /(?:sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AIza[A-Za-z0-9_-]{30,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})/],
  ["秘密鍵", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ["認証用の署名トークン", /eyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{20,}/],
  ["公開用の変数に秘密情報の名前", /NEXT_PUBLIC_[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY)/],
];

function forbiddenPath(name) {
  const parts = name.split("/");
  const base = parts.at(-1);
  return (base.startsWith(".env") && name !== ".env.example") ||
    parts.some((part) => [".local", ".next", ".guide-build", "node_modules", ".vercel"].includes(part)) ||
    /(?:\.(?:pem|p12|pfx|key)|^id_(?:rsa|dsa|ecdsa|ed25519))$/i.test(base);
}

export function inspectSecretText(name, text) {
  const issues = patterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  if (name === ".env.example") {
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY))\s*=\s*(.*?)\s*$/);
      if (match && !["", '""', "''"].includes(match[2])) issues.push("見本の秘密設定が空欄ではない");
    }
  }
  // 接続先URLなどからも、形式が未知の固定トークンを拾う。
  const assignment = /(?:ANTHROPIC_API_KEY|UPSTASH_REDIS_REST_TOKEN)\s*[=:]\s*["']([^"'\r\n]{12,})["']/g;
  for (const match of text.matchAll(assignment)) {
    if (!/^(?:dummy-|example-|test-)/.test(match[1])) issues.push("固定の認証情報");
  }
  return [...new Set(issues)];
}

export function scanRepository(cwd, mode = "worktree") {
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  const issues = [];
  const seen = new Set();
  let scanned = 0;
  const inspect = (name, read, identity = name) => {
    if (seen.has(identity)) return;
    seen.add(identity);
    if (forbiddenPath(name)) {
      issues.push({ path: name, reason: "アップロード禁止の設定・保存データ・生成物" });
      return;
    }
    scanned++;
    for (const reason of inspectSecretText(name, read())) issues.push({ path: name, reason });
  };
  if (mode === "worktree") {
    for (const name of git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean)) {
      const file = path.join(cwd, name);
      let stat;
      try { stat = lstatSync(file); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
      if (!stat.isFile() && !stat.isSymbolicLink()) continue;
      inspect(name, () => stat.isSymbolicLink() ? readlinkSync(file) : readFileSync(file, "utf8"));
    }
  } else if (mode === "staged") {
    for (const entry of git("ls-files", "--stage", "-z").split("\0").filter(Boolean)) {
      const split = entry.indexOf("\t");
      const [, oid, stage] = entry.slice(0, split).split(" ");
      const name = entry.slice(split + 1);
      if (stage !== "0") { issues.push({ path: name, reason: "未解決の競合" }); continue; }
      inspect(name, () => git("cat-file", "blob", oid));
    }
  } else if (mode === "history") {
    for (const commit of git("rev-list", "--all").trim().split("\n").filter(Boolean)) {
      const message = git("show", "-s", "--format=%B", commit);
      for (const reason of inspectSecretText("", message)) issues.push({ path: `コミット ${commit.slice(0, 7)}`, reason });
      for (const entry of git("ls-tree", "-r", "-z", commit).split("\0").filter(Boolean)) {
        const split = entry.indexOf("\t");
        const [, type, oid] = entry.slice(0, split).split(" ");
        const name = entry.slice(split + 1);
        if (type === "blob") inspect(name, () => git("cat-file", "blob", oid), `${name}:${oid}`);
      }
    }
  } else {
    throw new Error("検査方法が正しくありません。");
  }
  return { scanned, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && !["--staged", "--history"].includes(args[0]))) throw new Error();
    const cwd = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const { scanned, issues } = scanRepository(cwd, args[0]?.slice(2) ?? "worktree");
    if (issues.length) {
      console.error("秘密情報の検査で停止しました。値は表示しません。");
      for (const issue of issues) {
        let name = issue.path;
        for (const [, pattern] of patterns) name = name.replace(new RegExp(pattern.source, "g"), "[伏せ字]");
        console.error(`${JSON.stringify(name)}: ${issue.reason}`);
      }
      console.error("秘密の値を取り除き、漏えいした鍵は発行元で無効化・再発行してください。");
      process.exitCode = 1;
    } else console.log(`秘密情報の検査に成功しました（${scanned}件）。`);
  } catch {
    console.error("検査を完了できないため停止しました。GitとNode.jsの設定を確認してください。");
    process.exitCode = 1;
  }
}
