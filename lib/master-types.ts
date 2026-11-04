export type MasterData = {
  id: string;
  name: string;
  kind: "accounts" | "departments" | "rules" | "reference";
  filename: string;
  content: string;
};
export const MASTER_KINDS = { accounts: "勘定科目表", departments: "部門マスタ", rules: "経費精算規程", reference: "その他の共通資料" } as const;
