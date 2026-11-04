import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 解説サイト「くわしく読む：コードを読む」の抜粋が、いまの実装と一字一句同じかを確かめる。
const source = readFileSync(new URL("../lib/guide/detail-code.ts", import.meta.url), "utf8");
const readings = JSON.parse(source.slice(source.indexOf("= [") + 2, source.lastIndexOf("];") + 1));

test("コードの抜粋の各行が実装に含まれる", () => {
  assert.ok(readings.length > 0);
  for (const reading of readings) {
    const implementation = readFileSync(new URL(`../${reading.path}`, import.meta.url), "utf8");
    const lines = reading.lines.map((line) => line.code.trim());
    // 抜粋の行が、実装の中で同じ順番に連続して並んでいることを確かめる。
    const implLines = implementation.split("\n").map((line) => line.trim());
    const start = implLines.indexOf(lines[0]);
    assert.notEqual(start, -1, `${reading.path} に「${lines[0]}」がありません`);
    assert.deepEqual(implLines.slice(start, start + lines.length), lines, `${reading.title} の抜粋が実装と違います`);
    for (const line of reading.lines) assert.ok(line.explanation.trim(), `${reading.title} に説明のない行があります`);
  }
});

// 「くわしく読む」の図は、見出しの文字で置き場所を決めている。見出しを変えて図が消える事故を防ぐ。
test("詳細版の図の置き場所が、本文の見出しと一致する", () => {
  const files = ["detail.ts", "detail-program.ts", "detail-setup.ts"].map((name) => readFileSync(new URL(`../lib/guide/${name}`, import.meta.url), "utf8"));
  const headings = new Set(files.flatMap((text) => [...text.matchAll(/(?:^|`)## (.+)$/gm)].map((match) => match[1])));
  const slugs = files.flatMap((text) => [...text.matchAll(/^ {4}slug: "([^"]+)",$/gm)].map((match) => match[1]));
  assert.equal(new Set(slugs).size, slugs.length, "ページの slug が重複しています");
  const figures = readFileSync(new URL("../components/guide/DetailFigures.tsx", import.meta.url), "utf8");
  const topicKeys = [...figures.matchAll(/^ {2}"?([a-z-]+)"?: \{$/gm)].map((match) => match[1]);
  for (const key of topicKeys) assert.ok(slugs.includes(key), `図の対応表に、存在しないページ「${key}」があります`);
  const figureKeys = [...figures.matchAll(/^ {4}"([^"]+)": </gm)].map((match) => match[1]);
  assert.ok(figureKeys.length > 20);
  for (const key of figureKeys) assert.ok(headings.has(key), `図の置き場所「${key}」に当たる見出しが本文にありません`);
});
