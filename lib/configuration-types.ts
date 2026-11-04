import type { MasterData } from "@/lib/master-types";
export type EditableTask = {
  id: string;
  name: string;
  summary: string;
  manual: string;
  instructionPlaceholder: string;
};
export const CONFIGURATION_HISTORY_LIMIT = 10;
export type ConfigurationHistorySummary = {
  id: string;
  savedAt: string | null;
  description: string;
  isCurrent: boolean;
};
export type ConfigurationChange = { label: string; before: string; after: string };
export type ConfigurationHistoryDetail = {
  version: string;
  entry: ConfigurationHistorySummary;
  changes: ConfigurationChange[];
};
export type EditableConfiguration = {
  version: string;
  masters: MasterData[];
  tasks: EditableTask[];
  expenseRules: string;
  updatedAt: string | null;
  history: ConfigurationHistorySummary[];
  recovery: ConfigurationHistorySummary[];
};
export type TaskTextValues = Omit<EditableTask, "id">;
export type ConfigurationUpdate =
  | { version: string; target: "task"; taskId: string; values: TaskTextValues }
  | { version: string; target: "rules"; expenseRules: string }
  | { version: string; target: "masters"; masters: MasterData[] }
  | { version: string; target: "restore"; historyId: string };
