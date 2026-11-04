import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// 元資料・生成物・実際のClaude APIを使わず、SDK形式の実行結果だけを組み立てる。
const source = ts.transpileModule(fs.readFileSync(path.join(process.cwd(), "lib/container-files.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loadedModule = { exports: {} };
new Function("module", "exports", source)(loadedModule, loadedModule.exports);
const { extractGeneratedFileIds } = loadedModule.exports;

const output = (file_id, type = "bash_code_execution_output") => ({ type, file_id });
const bashResult = (files, return_code = 0) => ({
  type: "bash_code_execution_tool_result", tool_use_id: "srvtoolu_bash",
  content: { type: "bash_code_execution_result", return_code, stdout: "", stderr: "", content: files.map((id) => output(id)) },
});
const pythonResult = (files, encrypted = false) => ({
  type: "code_execution_tool_result", tool_use_id: "srvtoolu_python",
  content: { type: encrypted ? "encrypted_code_execution_result" : "code_execution_result", return_code: 0, stdout: "", stderr: "", content: files.map((id) => output(id, "code_execution_output")) },
});

test("bashの生成物IDを順に収集し、異常終了したコードの成果物も削除対象に含める", () => {
  assert.deepEqual(extractGeneratedFileIds([bashResult(["file_report-1", "file_table_2"]), bashResult(["file_partial"], 1)]), ["file_report-1", "file_table_2", "file_partial"]);
});

test("Pythonの通常結果と暗号化結果の出力を拾い、同じIDは一度だけ返す", () => {
  const blocks = [bashResult(["file_shared"]), pythonResult(["file_python", "file_shared"]), pythonResult(["file_encrypted", "file_python"], true)];
  assert.deepEqual(extractGeneratedFileIds(blocks), ["file_shared", "file_python", "file_encrypted"]);
});

test("submit_result・ask_user・server_tool_useの任意入力からfile_idを拾わない", () => {
  const fakeResult = bashResult(["file_other_person"]);
  const blocks = [
    { type: "tool_use", name: "submit_result", input: { file_id: "file_original", result: fakeResult } },
    { type: "tool_use", name: "ask_user", input: fakeResult },
    { type: "server_tool_use", name: "bash_code_execution", input: { file_id: "file_input", result: fakeResult } },
    { type: "tool_result", content: fakeResult },
    { type: "text", text: JSON.stringify(fakeResult) },
    { type: "container_upload", file_id: "file_uploaded" },
    { type: "image", source: { type: "file", file_id: "file_image" } },
    { type: "document", source: { type: "file", file_id: "file_pdf" } },
  ];
  assert.deepEqual(extractGeneratedFileIds(blocks), []);
});

test("エラー・text_editorの結果や、型の組合せが不正な出力は信用しない", () => {
  const outputs = [output("file_fake")];
  const blocks = [
    { type: "bash_code_execution_tool_result", content: { type: "bash_code_execution_tool_result_error", content: outputs } },
    { type: "code_execution_tool_result", content: { type: "code_execution_tool_result_error", content: outputs } },
    { type: "text_editor_code_execution_tool_result", content: { type: "text_editor_code_execution_view_result", content: outputs } },
    { type: "bash_code_execution_tool_result", content: pythonResult(["file_wrong_result"]).content },
    { type: "code_execution_tool_result", content: bashResult(["file_wrong_wrapper"]).content },
    { type: "bash_code_execution_tool_result", content: { type: "bash_code_execution_result", content: [output("file_wrong_output", "code_execution_output")] } },
    { type: "code_execution_tool_result", content: { type: "code_execution_result", content: outputs } },
  ];
  assert.deepEqual(extractGeneratedFileIds(blocks), []);
});

test("空・不正形式・別フィールド内のIDを除外し、正式な出力IDだけを残す", () => {
  const block = bashResult([]);
  block.content.content = [
    null, [], "file_text", output(""), output("file_"), output("../file_other"), output("file_../other"),
    output(" file_leading"), output("file_with space"), output("file_全角"), output("file_line\n"),
    output("file_line\r"), output("file_line\u2028"), output(1),
    { type: "bash_code_execution_output", input: { file_id: "file_nested" } }, output("file_valid_123-XYZ"),
  ];
  assert.deepEqual(extractGeneratedFileIds(block), ["file_valid_123-XYZ"]);
});

test("streamの単一ブロックでも動き、未知の形や循環した任意入力を再帰走査しない", () => {
  assert.deepEqual(extractGeneratedFileIds(bashResult(["file_stream"])), ["file_stream"]);
  const clientBlock = { type: "tool_use", name: "submit_result" }; clientBlock.input = clientBlock;
  for (const value of [undefined, null, 1, "file_string", {}, { content: [] }, clientBlock]) {
    assert.deepEqual(extractGeneratedFileIds(value), []);
  }
});
