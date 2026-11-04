// CSVの引用符・カンマ・改行を共通の規則で読み取る。値の空白は保持する。
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = "";
  let quoted = false; let closed = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',') { row.push(cell); cell = ""; closed = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      rows.push([...row, cell]); row = []; cell = ""; closed = false;
    } else if (c === '"') {
      if (cell || closed) throw new Error("CSVの引用符の位置を確認してください");
      quoted = true;
    } else if (closed) {
      if (c !== ' ' && c !== '\t') throw new Error("CSVの引用符の後に不要な文字があります");
    } else cell += c;
  }
  if (quoted) throw new Error("CSVの引用符が閉じていません");
  if (cell || row.length || closed) rows.push([...row, cell]);
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}
