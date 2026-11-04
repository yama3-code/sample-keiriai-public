import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ts from "typescript";

// 実際の表示部品を読み込み、外部通信・環境設定・APIキーを使わずに確認する。
const root = process.cwd();
const require = createRequire(import.meta.url);
function load(relative, cache = new Map()) {
  const file = path.resolve(root, relative);
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports: {} };
  cache.set(file, loadedModule);
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const localRequire = (name) => {
    if (name === "react-markdown") return { __esModule: true, default: ReactMarkdown };
    if (name === "remark-gfm") return { __esModule: true, default: remarkGfm };
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      assert.ok(resolved, `依存ファイルが見つかること：${name}`);
      return load(resolved, cache);
    }
    return require(name);
  };
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

test("危険な形式・省略されたホスト・利用者情報・長すぎるURLはリンクとして開かせない", () => {
  const { markdownLinkTarget } = load("lib/markdown-links.ts");
  for (const href of [
    undefined, "", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,確認", "file:///tmp/sample", "mailto:sample@example.invalid",
    "//example.invalid/path", "\\\\example.invalid/path", "https:///example.invalid/path", "https://sample:password@example.invalid/path",
    "https://sample@example.invalid/", "https://@example.invalid/", "https://example.invalid/\npath", "https://example.invalid/ path",
    "https://example.invalid/\u202e確認", `https://example.invalid/${"a".repeat(2050)}`, "https://example.invalid:65536/path",
  ]) assert.equal(markdownLinkTarget(href).kind, "blocked", String(href).slice(0, 80));
});

test("画面内・相対リンクは維持し、外部URLは実際の移動先が分かる表記にそろえる", () => {
  const { markdownLinkTarget } = load("lib/markdown-links.ts");
  for (const href of ["#main", "/masters", "./report.csv", "../manual", "?tab=history", "file_mock_1"]) {
    assert.deepEqual(markdownLinkTarget(href), { kind: "local", href });
  }
  assert.deepEqual(markdownLinkTarget("HTTPS://EXAMPLE.INVALID:443/確認"), { kind: "external", href: "https://example.invalid/%E7%A2%BA%E8%AA%8D" });
  const international = markdownLinkTarget("https://例え.テスト/確認");
  assert.equal(international.kind, "external");
  assert.match(international.href, /^https:\/\/xn--/);
});

test("通常・参照・自動リンクを初期表示では外部へ直接開けず、移動先を文字で確認できる", () => {
  const SafeMarkdown = load("components/SafeMarkdown.tsx").default;
  const markdown = `[確認先](https://example.invalid/check?data=sample)

[参照先][ref]

<https://example.invalid/auto>

[画面内](#main) [設定](/masters)

[不正](javascript:alert(1)) [省略](//example.invalid/relative)

[ref]: https://example.invalid/reference
`;
  const html = renderToStaticMarkup(createElement(SafeMarkdown, null, markdown));
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 3);
  assert.match(html, /移動先：https:\/\/example\.invalid\/check\?data=sample/);
  assert.match(html, /移動先：https:\/\/example\.invalid\/reference/);
  assert.doesNotMatch(html, /<a\b[^>]*href="(?:https?:|\/\/)/i);
  assert.doesNotMatch(html, /javascript:|<dialog|window\.open/);
  assert.match(html, /href="#main"/);
  assert.match(html, /href="\/masters"/);
});

test("リンクの確認を加えても画像の読込・HTML埋込を止め、文章と表の表示は保つ", () => {
  const SafeMarkdown = load("components/SafeMarkdown.tsx").default;
  const html = renderToStaticMarkup(createElement(SafeMarkdown, null, `## 架空の確認

| 部門 | 金額 |
| --- | --- |
| 営業部 | 100 |

![画像](https://example.invalid/pixel.png)

<iframe src="https://example.invalid/frame"></iframe>
<script>alert(1)</script>
`));
  assert.doesNotMatch(html, /<(?:img|link|iframe|script)\b/i);
  assert.match(html, /<h2>架空の確認<\/h2>/);
  assert.match(html, /<td>100<\/td>/);
});

test("全ページの保護ヘッダーが埋込・型推測・参照元通知を防ぎ、本番でevalや外部接続を許可しない", () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const mode of ["production", "development"]) {
      process.env.NODE_ENV = mode;
      const config = load("next.config.ts").default;
      const rule = config.headers().find((entry) => entry.source === "/:path*");
      assert.ok(rule);
      const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
      assert.equal(headers["x-frame-options"], "DENY");
      assert.equal(headers["x-content-type-options"], "nosniff");
      assert.equal(headers["referrer-policy"], "no-referrer");
      assert.equal(headers["x-dns-prefetch-control"], "off");
      assert.match(headers["permissions-policy"], /camera=\(\)/);
      const csp = headers["content-security-policy"];
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /frame-src 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.match(csp, /base-uri 'none'/);
      assert.match(csp, /form-action 'self'/);
      assert.match(csp, /default-src 'self'/);
      assert.doesNotMatch(csp, /nonce-/);
      if (mode === "production") {
        assert.doesNotMatch(csp, /unsafe-eval|ws:|wss:/);
        assert.match(csp, /connect-src 'self';/);
      } else assert.match(csp, /'unsafe-eval'/);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
