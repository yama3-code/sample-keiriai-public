import { accountCodes, departmentNames } from "@/lib/knowledge";

// エージェントが提出する結果の形と、アプリ側での検算

export type JournalEntry = {
  voucher_no: string;
  date: string;
  debit_code: string;
  debit_account: string;
  debit_department: string;
  debit_amount: number;
  credit_code: string;
  credit_account: string;
  credit_department: string;
  credit_amount: number;
  memo: string;
};

export type TaskResult = {
  summary: string;
  steps: { title: string; result: string }[];
  entries: JournalEntry[];
  issues: { level: "要確認" | "注意"; message: string }[];
};

export type Check = { ok: boolean; label: string; detail?: string };

// Claude に渡す「結果提出ツール」の定義
export const submitResultTool = {
  name: "submit_result",
  description:
    "作業マニュアルのすべての手順が終わったあとに、作成した仕訳・作業ログ・要確認事項を提出する。1回だけ呼び出す。",
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["summary", "steps", "entries", "issues"],
    properties: {
      summary: { type: "string", description: "作業結果の要約（2〜4文）" },
      steps: {
        type: "array",
        description: "マニュアルの手順ごとの作業ログ",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "result"],
          properties: {
            title: { type: "string", description: "例：手順3：配賦額の計算" },
            result: { type: "string", description: "その手順で行ったことと結果（数値を含めて具体的に）" },
          },
        },
      },
      entries: {
        type: "array",
        description: "作成した仕訳。1行に借方・貸方を1つずつ持つ",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "voucher_no",
            "date",
            "debit_code",
            "debit_account",
            "debit_department",
            "debit_amount",
            "credit_code",
            "credit_account",
            "credit_department",
            "credit_amount",
            "memo",
          ],
          properties: {
            voucher_no: { type: "string" },
            date: { type: "string", description: "YYYY-MM-DD" },
            debit_code: { type: "string" },
            debit_account: { type: "string" },
            debit_department: { type: "string" },
            debit_amount: { type: "integer" },
            credit_code: { type: "string" },
            credit_account: { type: "string" },
            credit_department: { type: "string" },
            credit_amount: { type: "integer" },
            memo: { type: "string" },
          },
        },
      },
      issues: {
        type: "array",
        description: "要確認事項（仕訳にしなかったもの、人の判断が必要なもの）",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["level", "message"],
          properties: {
            level: { type: "string", enum: ["要確認", "注意"] },
            message: { type: "string" },
          },
        },
      },
    },
  },
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// 提出内容の形が正しいかを確認する（不正なら null）
export function parseResult(input: unknown): TaskResult | null {
  if (!isObject(input)) return null;
  const { summary, steps, entries, issues } = input;
  if (typeof summary !== "string" || !Array.isArray(steps) || !Array.isArray(entries) || !Array.isArray(issues)) {
    return null;
  }
  const strFields = [
    "voucher_no", "date", "debit_code", "debit_account", "debit_department",
    "credit_code", "credit_account", "credit_department", "memo",
  ];
  const entriesOk = entries.every(
    (e) =>
      isObject(e) &&
      strFields.every((f) => typeof e[f] === "string") &&
      Number.isSafeInteger(e.debit_amount) &&
      Number.isSafeInteger(e.credit_amount),
  );
  const stepsOk = steps.every((s) => isObject(s) && typeof s.title === "string" && typeof s.result === "string");
  const issuesOk = issues.every((i) => isObject(i) && (i.level === "要確認" || i.level === "注意") && typeof i.message === "string");
  if (!entriesOk || !stepsOk || !issuesOk) return null;
  return input as TaskResult;
}

// AIとは別に、プログラムで仕訳を検算する
export function checkEntries(entries: JournalEntry[], masters = { accountCodes, departmentNames }): Check[] {
  const { accountCodes: currentAccounts, departmentNames: currentDepartments } = masters;
  const checks: Check[] = [];
  const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

  const debitTotal = entries.reduce((s, e) => s + e.debit_amount, 0);
  const creditTotal = entries.reduce((s, e) => s + e.credit_amount, 0);
  const exact = entries.every((e) => Number.isSafeInteger(e.debit_amount) && Number.isSafeInteger(e.credit_amount));
  const exactDebit = exact ? entries.reduce((s, e) => s + BigInt(e.debit_amount), BigInt(0)) : null;
  const exactCredit = exact ? entries.reduce((s, e) => s + BigInt(e.credit_amount), BigInt(0)) : null;
  checks.push({
    ok: exact && Number.isSafeInteger(debitTotal) && Number.isSafeInteger(creditTotal),
    label: "金額を正確に扱える範囲",
    detail: !exact || !Number.isSafeInteger(debitTotal) || !Number.isSafeInteger(creditTotal) ? "金額または合計が正確に扱える整数の範囲を超えています。データを分けてください。" : undefined,
  });
  checks.push({
    ok: exact && exactDebit === exactCredit,
    label: "全体の貸借一致",
    detail: exact ? `借方 ${exactDebit!.toLocaleString("ja-JP")}円 ／ 貸方 ${exactCredit!.toLocaleString("ja-JP")}円` : `借方 ${yen(debitTotal)} ／ 貸方 ${yen(creditTotal)}`,
  });

  const unbalanced = entries.filter((e) => e.debit_amount !== e.credit_amount);
  checks.push({
    ok: unbalanced.length === 0,
    label: "行ごとの貸借一致",
    detail: unbalanced.length ? `不一致：${unbalanced.map((e) => e.voucher_no).join("、")}` : undefined,
  });

  const badAccounts = entries.flatMap((e) =>
    [
      [e.debit_code, e.debit_account],
      [e.credit_code, e.credit_account],
    ]
      .filter(([code, name]) => currentAccounts.get(code) !== name)
      .map(([code, name]) => `${e.voucher_no}（${code} ${name}）`),
  );
  checks.push({
    ok: badAccounts.length === 0,
    label: "勘定科目が勘定科目表と一致",
    detail: badAccounts.length ? `不一致：${badAccounts.join("、")}` : undefined,
  });

  const badDepartments = entries.flatMap((e) =>
    [e.debit_department, e.credit_department]
      .filter((d) => d !== "" && !currentDepartments.has(d))
      .map((d) => `${e.voucher_no}（${d}）`),
  );
  checks.push({
    ok: badDepartments.length === 0,
    label: "部門が部門マスタと一致",
    detail: badDepartments.length ? `不一致：${badDepartments.join("、")}` : undefined,
  });

  const badDates = entries.filter((e) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return true;
    const parsed = new Date(`${e.date}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== e.date;
  });
  checks.push({
    ok: badDates.length === 0,
    label: "日付の形式",
    detail: badDates.length ? `不正：${badDates.map((e) => e.voucher_no).join("、")}` : undefined,
  });

  const negatives = entries.filter((e) => e.debit_amount <= 0 || e.credit_amount <= 0);
  checks.push({
    ok: negatives.length === 0,
    label: "金額が正の数",
    detail: negatives.length ? `0以下：${negatives.map((e) => e.voucher_no).join("、")}` : undefined,
  });

  return checks;
}

// 会計ソフト取り込み用のCSV（Excelで文字化けしないようBOM付き）
export class UnsafeCsvError extends Error {
  constructor() { super("仕訳の文字項目に、Excelで数式として扱われる内容があります。元データを確認して再実行してください。"); }
}

// 引用符や文字の付け足しで会計ソフトの値を変えず、危険な内容は出力前に停止する。
export function isUnsafeCsvText(value: string): boolean {
  const normalized = value.normalize("NFKC").replace(/^[\s\p{Cf}\u0000-\u001f\u007f-\u009f]+/u, "");
  return /^[=+\-@]/.test(normalized);
}

export function toCsv(entries: JournalEntry[]): string {
  const header = [
    "伝票番号", "日付", "借方科目コード", "借方科目", "借方部門", "借方金額",
    "貸方科目コード", "貸方科目", "貸方部門", "貸方金額", "摘要",
  ];
  const escape = (v: string | number) => {
    if (typeof v === "string" && isUnsafeCsvText(v)) throw new UnsafeCsvError();
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = entries.map((e) =>
    [
      e.voucher_no, e.date, e.debit_code, e.debit_account, e.debit_department, e.debit_amount,
      e.credit_code, e.credit_account, e.credit_department, e.credit_amount, e.memo,
    ].map(escape).join(","),
  );
  return "﻿" + [header.join(","), ...rows].join("\r\n") + "\r\n";
}
