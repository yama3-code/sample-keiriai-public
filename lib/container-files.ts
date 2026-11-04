const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// 呼出し元は、APIから受け取ったassistantのcontentか、streamのcontent_blockだけを渡す。
// 任意のtool入力・本文・元資料のfile_idは走査せず、実行結果の正式な出力形式だけを扱う。
export function extractGeneratedFileIds(content: unknown): string[] {
  const blocks: unknown[] = Array.isArray(content) ? content : [content];
  const ids = new Set<string>();
  for (const block of blocks) {
    if (!isObject(block) || !isObject(block.content)) continue;
    const result = block.content;
    let outputType: string;
    if (block.type === "bash_code_execution_tool_result" && result.type === "bash_code_execution_result") {
      outputType = "bash_code_execution_output";
    } else if (block.type === "code_execution_tool_result"
      && (result.type === "code_execution_result" || result.type === "encrypted_code_execution_result")) {
      outputType = "code_execution_output";
    } else continue;
    if (!Array.isArray(result.content)) continue;
    for (const output of result.content) {
      if (isObject(output) && output.type === outputType
        && typeof output.file_id === "string" && output.file_id.startsWith("file_")
        && output.file_id.length > 5 && !/[^a-zA-Z0-9_-]/.test(output.file_id)) {
        ids.add(output.file_id);
      }
    }
  }
  return [...ids];
}
