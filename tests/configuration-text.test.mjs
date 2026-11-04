import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import ts from "typescript";

const compiled = ts.transpileModule(fs.readFileSync(new URL("../lib/configuration-text.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", compiled)(loaded.exports);
const { hasUnsupportedControlCharacters } = loaded.exports;

test("C0制御文字は改行・タブを除いて、本文の途中でも拒否する", () => {
  for (let code = 0; code <= 0x1f; code++) {
    const expected = ![0x09, 0x0a, 0x0d].includes(code);
    assert.equal(hasUnsupportedControlCharacters(`架空の手順${String.fromCharCode(code)}確認する`), expected, `U+${code.toString(16).padStart(4, "0")}`);
  }
});

test("DELとC1制御文字をすべて拒否する", () => {
  for (let code = 0x7f; code <= 0x9f; code++) {
    assert.equal(hasUnsupportedControlCharacters(`架空のマスタ${String.fromCharCode(code)}本文`), true, `U+${code.toString(16).padStart(4, "0")}`);
  }
});

test("日本語・引用符・CSVの改行・タブ・通常のUnicode文字は変更せず受け付ける", () => {
  for (const text of [
    "", "架空の経費精算規程：交通費を確認する。😀", "科目コード,科目名\r\n1110,現金\r\n",
    '部門\t金額\n営業部\t"1,000"\n', "改行\r単独の復帰\n単独の改行\tタブ", '引用符"と斜線\\',
    "境界の通常文字\u0020\u007e\u00a0\u2028\u2029",
  ]) assert.equal(hasUnsupportedControlCharacters(text), false);
});

test("長い本文の末尾の制御文字も検出し、許可した改行を制御文字と誤認しない", () => {
  const manual = "架空の手順\r\n\t".repeat(5000);
  assert.equal(hasUnsupportedControlCharacters(manual), false);
  assert.equal(hasUnsupportedControlCharacters(`${manual}\u0001`), true);
  assert.equal(hasUnsupportedControlCharacters(`\u009f${manual}`), true);
});
