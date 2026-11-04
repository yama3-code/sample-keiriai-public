import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 解説だけを別の作業場所へコピーし、業務APIや秘密設定を含めずに静的ページを作る。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".guide-build");
const marker = path.join(target, ".generated-by-guide-build");
if (existsSync(target) && !existsSync(marker)) throw new Error("解説用の作業場所を確認できないため、既存の内容は変更しません。");
if (existsSync(target)) rmSync(target, { recursive: true });
mkdirSync(target);
writeFileSync(marker, "解説サイト専用の生成先。元データは保存しない。\n");
for (const relative of ["app/guide", "components/guide", "components/MarkdownLink.tsx", "components/MarkdownLink.module.css", "lib/guide", "lib/markdown-links.ts", "app/globals.css", "app/favicon.ico", "tsconfig.json"]) {
  const destination = path.join(target, relative);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(path.join(root, relative), destination, { recursive: true });
}
const sourcePackage = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const dependencies = Object.fromEntries(["next", "react", "react-dom", "react-markdown", "remark-gfm"].map((name) => [name, sourcePackage.dependencies[name]]));
writeFileSync(path.join(target, "package.json"), JSON.stringify({ name: "keiri-guide-export", version: "0.1.0", private: true, dependencies }, null, 2));
writeFileSync(path.join(target, "next.config.mjs"), 'export default { output: "export", trailingSlash: true };\n');
writeFileSync(path.join(target, "app/layout.tsx"), `import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "経理AIのしくみ", description: "経理担当者のためのシステム学習ガイド", robots: { index: false, follow: false } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ja"><body>{children}</body></html>; }
`);
writeFileSync(path.join(target, "app/page.tsx"), `import GuideLayout from "./guide/layout";
import GuideHome from "./guide/page";
export default function Home() { return <GuideLayout><GuideHome /></GuideLayout>; }
`);

// シェルに設定済みの秘密値も、解説のビルドには引き継がない。
const environment = { ...process.env, GUIDE_SITE_ONLY: "1", NEXT_TELEMETRY_DISABLED: "1" };
for (const name of Object.keys(environment)) {
  if (/TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY/i.test(name) || name.startsWith("ANTHROPIC_") || name.startsWith("UPSTASH_") || name.startsWith("NEXT_PUBLIC_")) delete environment[name];
}
const require = createRequire(import.meta.url);
const build = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "build", target, "--webpack"], { cwd: target, env: environment, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status || 1);

// noindexを読み取れるよう巡回は許可する。robots.txtだけの巡回禁止には頼らない。
const output = path.join(target, "out");
writeFileSync(path.join(output, "robots.txt"), "User-agent: *\nAllow: /\n");
// 完成した静的ファイルだけをCLIで公開する場合にも、同じ検索除外を適用する。
const deploymentConfig = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
writeFileSync(path.join(output, "vercel.json"), JSON.stringify({ ...deploymentConfig, buildCommand: "", installCommand: "", outputDirectory: "." }, null, 2));
let htmlCount = 0;
function verify(directory) {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) { verify(file); continue; }
    if (item.name.endsWith(".html")) {
      const html = readFileSync(file, "utf8");
      if (!/<meta\s+name="robots"\s+content="[^"]*noindex/.test(html)) throw new Error("検索除外の指定がないページがあるため停止しました。");
      if (html.includes("業務画面へ →")) throw new Error("解説の公開先へ業務画面のリンクが混入しています。");
      htmlCount++;
    }
  }
}
verify(output);
for (const forbidden of ["api", "edit", "masters", ".env.local", "data", "tasks"]) {
  if (existsSync(path.join(output, forbidden))) throw new Error("解説以外の出力があるため停止しました。");
}
console.log(`解説専用の静的ページを作成しました。HTML ${htmlCount}件の検索除外と、業務画面を含めないことを確認済み。`);
