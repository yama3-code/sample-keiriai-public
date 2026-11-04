import { isUnsafeCsvText, parseResult, submitResultTool, type TaskResult } from "@/lib/journal";

export type ResultTable = { name: string; columns: string[]; rows: string[][] };
export type ExportTable = ResultTable & { csv: string | null };
export type GeneralResult = TaskResult & { report: string; tables: ResultTable[] };
export const submitGeneralResultTool = {
  ...submitResultTool,
  description: "依頼された処理が終わったら、報告書・集計表・作業ログ・要確認事項を提出する。仕訳を依頼されていなければentriesは空にする。",
  input_schema: {
    ...submitResultTool.input_schema,
    required: [...submitResultTool.input_schema.required, "report", "tables"],
    properties: {
      ...submitResultTool.input_schema.properties,
      report: { type: "string", description: "担当者に渡す日本語の報告書。依頼への回答・結論・根拠・対象期間・除外事項を、見出しや箇条書きで分かりやすく書く" },
      tables: { type: "array", description: "集計表・照合表・チェック一覧など。不要なら空の配列。最大10表・1表500行30列・全体15,000セルまで。セルは計算済みの文字列とし、Excelの数式は含めない", items: {
        type: "object", additionalProperties: false, required: ["name", "columns", "rows"],
        properties: {
          name: { type: "string", description: "表の名前" },
          columns: { type: "array", items: { type: "string" }, description: "列の見出し" },
          rows: { type: "array", items: { type: "array", items: { type: "string" } }, description: "行ごとのセル。各行のセル数を見出しの列数とそろえる" },
        },
      } },
    },
  },
};

export function parseGeneralResult(input: unknown): GeneralResult | null {
  const basic = parseResult(input);
  if (!basic) return null;
  const result = input as GeneralResult;
  if (typeof result.report !== "string" || result.report.length > 100_000 || !Array.isArray(result.tables) || result.tables.length > 10) return null;
  let cells = 0;
  let characters = result.report.length;
  for (const table of result.tables) {
    if (!table || typeof table !== "object" || typeof table.name !== "string" || table.name.length > 200
      || !Array.isArray(table.columns) || table.columns.length === 0 || table.columns.length > 30
      || !table.columns.every((cell) => typeof cell === "string" && cell.length <= 1000)
      || !Array.isArray(table.rows) || table.rows.length > 500) return null;
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length !== table.columns.length || !row.every((cell) => typeof cell === "string" && cell.length <= 5000)) return null;
      cells += row.length; characters += row.reduce((sum, cell) => sum + cell.length, 0);
    }
  }
  return cells <= 15_000 && characters <= 500_000 ? result : null;
}

// 数値だけの負数は数値として出力し、命令として解釈される文字列はCSVにしない。
export function tableCsv(table: ResultTable): string | null {
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
  const allRows = [table.columns, ...table.rows];
  if (allRows.some((row, index) => row.some((cell) => isUnsafeCsvText(cell)
    && !(index > 0 && numeric.test(cell) && Number.isFinite(Number(cell)))))) return null;
  const escape = (cell: string) => /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  return "\uFEFF" + allRows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
export const exportTables = (tables: ResultTable[]): ExportTable[] => tables.map((table) => ({ ...table, csv: tableCsv(table) }));
