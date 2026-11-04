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
