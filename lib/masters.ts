import { parseCsv } from "@/lib/csv";
import fs from "node:fs";
import path from "node:path";
import type { MasterData } from "@/lib/master-types";

export function defaultMasters(): MasterData[] {
  return [
    { id: "accounts", name: "勘定科目表", kind: "accounts", filename: "accounts.csv" },
    { id: "departments", name: "部門マスタ", kind: "departments", filename: "departments.csv" },
    { id: "rules", name: "経費精算規程", kind: "rules", filename: "expense-rules.md" },
  ].map((item) => ({ ...item, content: fs.readFileSync(path.join(process.cwd(), "data", item.filename), "utf8").trim() })) as MasterData[];
}

// 引用符内のカンマ・改行を含むCSVも、検算に使えるように読む。
export function masterRows(text: string): string[][] {
  return parseCsv(text).map((row) => row.map((cell) => cell.trim()));
}

export function validateMasters(value: unknown): asserts value is MasterData[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("共通データは20件までです");
  const ids = new Set(); const kinds = new Set(); let total = 0;
  for (const m of value) {
    if (!m || typeof m !== "object" || Object.keys(m).sort().join() !== "content,filename,id,kind,name"
      || typeof m.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(m.id) || ids.has(m.id)
      || !["accounts", "departments", "rules", "reference"].includes(m.kind)
      || typeof m.name !== "string" || !m.name.trim() || m.name.length > 100
      || typeof m.filename !== "string" || !/^[^/\\\x00-\x1f]{1,200}\.(csv|txt|md)$/i.test(m.filename)
      || typeof m.content !== "string" || !m.content.trim() || m.content.length > 50_000 || m.content.includes('\0')) {
      throw new Error("名前・ファイル形式・内容を確認してください（CSV・TXT・MD、本文50,000文字まで）");
    }
    total += m.content.length; ids.add(m.id);
    if (m.kind !== "reference") {
      if (kinds.has(m.kind)) throw new Error("勘定科目表・部門マスタ・経費精算規程は各1件までです");
      kinds.add(m.kind);
    }
    if (m.kind === "accounts" || m.kind === "departments") {
      const [header, ...rows] = masterRows(m.content.replace(/^\uFEFF/, ""));
      const required = m.kind === "accounts" ? ["科目コード", "科目名"] : ["部門コード", "部門名", "人数"];
      if (!header || required.some((key) => header.filter((h) => h === key).length !== 1) || !rows.length
        || rows.some((r) => r.length !== header.length)) throw new Error(`${m.name}のCSVの列を確認してください。必須列：${required.join("・")}`);
      const keys = new Set(); const names = new Set();
      for (const row of rows) {
        const code = row[header.indexOf(required[0])]; const name = row[header.indexOf(required[1])];
        if (!code || !name || keys.has(code) || names.has(name)) throw new Error(`${m.name}に空欄またはコード・名前の重複があります`);
        if (m.kind === "departments" && !/^\d+$/.test(row[header.indexOf("人数")])) throw new Error("部門の人数は0以上の整数にしてください");
        keys.add(code); names.add(name);
      }
    }
  }
  if (total > 150_000) throw new Error("共通データの合計は150,000文字までです");
}
export function masterChecks(masters: MasterData[]) {
  const accounts = masters.find((m) => m.kind === "accounts");
  const departments = masters.find((m) => m.kind === "departments");
  const accountRows = accounts ? masterRows(accounts.content) : [];
  const deptRows = departments ? masterRows(departments.content) : [];
  return {
    accountCodes: new Map(accountRows.slice(1).map((r) => [r[accountRows[0].indexOf("科目コード")], r[accountRows[0].indexOf("科目名")]])),
    departmentNames: new Set(deptRows.slice(1).map((r) => r[deptRows[0].indexOf("部門名")])),
  };
}
export function masterPrompt(masters: MasterData[]) {
  return `<shared_data>\n${masters.map((m) => JSON.stringify({ name: m.name, kind: m.kind, filename: m.filename, content: m.content })).join('\n')}\n</shared_data>\n登録されていない共通データは参照できません。必要な情報がない場合は推測せず質問または要確認にしてください。`;
}
export function masterList(masters: MasterData[]) {
  return masters.map((m) => ({ name: m.name, detail: m.kind === "accounts" || m.kind === "departments" ? `${masterRows(m.content).length - 1}件` : `${m.content.length.toLocaleString("ja-JP")}文字` }));
}
