import fs from "node:fs";
import path from "node:path";

// すべての業務で使う共通データ（/data フォルダ）と、エージェントへの基本指示

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), "data", file), "utf8").trim();

const accounts = read("accounts.csv");
export const loadExpenseRules = () => read("expense-rules.md");
const rules = loadExpenseRules();
export const expenseRules = rules;
const departments = read("departments.csv");

const countLines = (csv: string) => csv.split("\n").length - 1; // 見出し行を除く

// 画面に表示する「共通データ」の一覧
export const sharedDataForRules = (currentRules: string) => [
  { name: "勘定科目表", detail: `${countLines(accounts)}科目` },
  { name: "経費精算規程", detail: `全${(currentRules.match(/^## 第\d+条/gm) ?? []).length}条` },
  { name: "部門マスタ", detail: `${countLines(departments)}部門` },
];
export const sharedData = sharedDataForRules(rules);

// 勘定科目コード・部門名の一覧（仕訳の検証に使う）
export const accountCodes = new Map(
  accounts
    .split("\n")
    .slice(1)
    .map((line) => line.split(","))
    .map(([code, name]) => [code, name] as const),
);
export const departmentNames = new Set(
  departments
    .split("\n")
    .slice(1)
    .map((line) => line.split(",")[1]),
);

export const agentInstructions = `あなたは「株式会社サンプル商事」（従業員約300名のITサービス会社。架空の会社）の経理AIエージェントです。経理担当者から依頼された業務を、作業マニュアルのとおりに実行します。

# 作業の進め方
- 添付された入力ファイルはコード実行環境にアップロード済みです。ファイルの場所が分からなければ、まず find などで探してください。添付がない場合は、担当者の依頼文だけを使い、存在しないデータを作らないでください。
- 共通データ（勘定科目表・経費精算規程・部門マスタ）と作業マニュアルは、このあと <shared_data> と <manual> に記載しています。
- 作業マニュアルの手順を、手順1から順番に実行してください。
- **金額の計算・集計・突き合わせは、必ずPython（pandas等）のコードで行ってください。** 暗算や目算で金額を決めてはいけません。
- コードの先頭行には「# 手順2: 配賦基準の決定」のように、マニュアルのどの手順かを書いてください（画面に進み具合として表示されます）。
- コードは1回の実行で多くを詰め込みすぎず、手順ごとに実行してください。

# 判断のルール
- マニュアルや規程に書かれていないこと、データに不備があること、判断に迷うことは、推測で処理せず「要確認事項」に記載してください。その対象は仕訳にしないでください。
- 要確認事項には、理由と、根拠にした規程の条文・マニュアルの手順を書いてください。

# 結果の提出
- すべての手順が終わったら、依頼に合った成果物（集計表・報告書・仕訳など）・作業ログ・要確認事項を整え、その内容を submit_result ツールで1回だけ提出してください。計算を含む成果物はコードで整えて確認してください。
- 仕訳の金額は、コードで計算した値をそのまま写してください。
- 提出する仕訳は1行ごとに借方と貸方を1つずつ持ち、借方金額と貸方金額は同じにします。勘定科目は勘定科目表のコードと名前を使い、部門は部門マスタの部門名（不要なら空文字）を使います。
- 仕訳が1件もない場合は entries を空の配列にしてください。
- 回答・ログはすべて日本語で書いてください。`;

export const sharedDataPromptForRules = (currentRules: string) => `<shared_data>
<accounts title="勘定科目表" format="CSV">
${accounts}
</accounts>

<departments title="部門マスタ" format="CSV">
${departments}
</departments>

<expense_rules title="経費精算規程">
${currentRules}
</expense_rules>
</shared_data>`;
export const sharedDataPrompt = sharedDataPromptForRules(rules);
