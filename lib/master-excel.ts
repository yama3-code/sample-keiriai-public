import * as XLSX from "xlsx";

export type ExcelMaster = { filename: string; sheetNames: string[]; workbook: XLSX.WorkBook };

// Excelは端末内で値のCSVに変換する。元のブックやマクロは保存・実行しない。
export function readExcelMaster(bytes: ArrayBuffer, filename: string): ExcelMaster {
  if (!/\.(xlsx|xls)$/i.test(filename) || bytes.byteLength === 0 || bytes.byteLength > 2 * 1024 * 1024) {
    throw new Error("Excelは2MBまでのxlsx・xlsを選んでください。");
  }
  const data = new Uint8Array(bytes);
  const starts = (header: number[]) => header.every((v, i) => data[i] === v);
  if (/\.xlsx$/i.test(filename) ? !starts([0x50, 0x4b, 3, 4]) : !starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new Error("Excelファイルの形式を確認してください。xlsx・xlsで保存し直してお試しください。");
  }
  let workbook: XLSX.WorkBook;
  try { workbook = XLSX.read(bytes, { type: "array", cellFormula: true, sheetRows: 10002, bookVBA: false }); }
  catch { throw new Error("Excelを読み込めませんでした。パスワードを解除し、xlsx・xlsで保存し直してください。"); }
  const sheetNames = workbook.SheetNames.filter((name, index) => !workbook.Workbook?.Sheets?.[index]?.Hidden && workbook.Sheets[name]?.["!ref"]);
  if (!sheetNames.length || sheetNames.length > 20) throw new Error("読み込むシートは1〜20枚の範囲にしてください。非表示・空のシートは選べません。");
  return { filename, sheetNames, workbook };
}
export function excelMasterSheet(source: ExcelMaster, sheetName: string): { filename: string; content: string } {
  if (!source.sheetNames.includes(sheetName)) throw new Error("取り込むシートを選んでください。");
  const sheet = source.workbook.Sheets[sheetName];
  const range = XLSX.utils.decode_range(String(sheet["!fullref"] || sheet["!ref"] || "A1"));
  const rows = range.e.r - range.s.r + 1; const cols = range.e.c - range.s.c + 1;
  if (rows > 10000 || cols > 100 || rows * cols > 100000) throw new Error("シートが大きすぎます。10,000行・100列・100,000セル以内に整理してください。");
  if (sheet["!merges"]?.length) throw new Error("結合セルを解除して、1行目を列名にしてください。");
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!")) continue;
    if (cell.f || cell.F) throw new Error("数式のあるシートです。Excelでコピー→値として貼り付けしてから読み込んでください。");
    if (cell.t === "e") throw new Error("Excelのエラー値が含まれています。セルの内容を修正してください。");
  }
  // 表示形式を使い、001などのコードを保持する。空の末尾行は除く。
  const content = XLSX.utils.sheet_to_csv(sheet, { blankrows: false, FS: ",", RS: "\n" }).replace(/^\uFEFF/, "");
  if (!content.trim() || content.length > 50_000) throw new Error("シートは空欄にできません。変換後の内容が50,000文字以内になるよう整理してください。");
  const name = `${source.filename.replace(/\.(xlsx|xls)$/i, "")}_${sheetName}`.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 190);
  return { filename: `${name}.csv`, content };
}
