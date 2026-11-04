import { DEFAULT_EFFORT, EFFORTS, MODELS, modelOptions, type Effort, type ModelOption } from "@/lib/models";

type Environment = Readonly<Record<string, string | undefined>>;
export type UsagePolicy = {
  publicMode: boolean;
  models: ModelOption[];
  efforts: (typeof EFFORTS)[number][];
  defaultModel: string;
  defaultEffort: Effort;
  newRunsPerBrowserHour: number;
  newRunsPerAddressHour: number;
  newRunsPerHour: number;
  newRunsPerDay: number;
  maxOutputTokens: number;
  maxRounds: number;
  notice: string;
};

export class UsagePolicyError extends Error {
  constructor() { super("公開用の利用制限の設定が正しくありません。管理者に設定を確認してください。"); }
}

const PUBLIC_MODELS = new Set(["claude-haiku-5-5", "claude-sonnet-5-5"]);
const PUBLIC_EFFORTS = new Set<Effort>(["low", "medium"]);

function integerSetting(env: Environment, name: string, fallback: number, minimum: number, maximum: number): number {
  const text = env[name]?.trim();
  if (!text) return fallback;
  if (!/^[1-9]\d*$/.test(text)) throw new UsagePolicyError();
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new UsagePolicyError();
  return value;
}

// サーバー側だけで環境設定を読み、画面と実行APIに同じ許可範囲を渡す。
// 公開時の制限を、ブラウザから届いたモデル名・設定値で広げることはできない。
export function loadUsagePolicy(env: Environment = process.env): UsagePolicy {
  const publicMode = env.NODE_ENV === "production" || Boolean(env.VERCEL);
  if (!publicMode) {
    const defaultModel = env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
    return {
      publicMode: false,
      models: modelOptions(defaultModel), efforts: [...EFFORTS], defaultModel, defaultEffort: DEFAULT_EFFORT,
      newRunsPerBrowserHour: 5, newRunsPerAddressHour: 5, newRunsPerHour: 10, newRunsPerDay: 30,
      maxOutputTokens: 32000, maxRounds: 12, notice: "",
    };
  }

  const newRunsPerHour = integerSetting(env, "PUBLIC_RUNS_PER_HOUR", 5, 1, 10);
  const newRunsPerDay = integerSetting(env, "PUBLIC_RUNS_PER_DAY", 10, 1, 30);
  const newRunsPerBrowserHour = integerSetting(env, "PUBLIC_RUNS_PER_BROWSER_HOUR", 5, 1, 5);
  const newRunsPerAddressHour = integerSetting(env, "PUBLIC_RUNS_PER_ADDRESS_HOUR", Math.min(3, newRunsPerHour), 1, newRunsPerHour);
  const maxOutputTokens = integerSetting(env, "PUBLIC_MAX_OUTPUT_TOKENS", 8000, 1024, 32000);
  const maxRounds = integerSetting(env, "PUBLIC_MAX_ROUNDS", 6, 1, 12);
  const defaultModel = env.PUBLIC_DEFAULT_MODEL?.trim() || "claude-haiku-5-5";
  const defaultEffort = env.PUBLIC_DEFAULT_EFFORT?.trim() || "low";
  if (!PUBLIC_MODELS.has(defaultModel) || !PUBLIC_EFFORTS.has(defaultEffort as Effort)) throw new UsagePolicyError();

  return {
    publicMode: true,
    // 自動切替先が許可範囲を外れないよう、公開版ではAPI側のモデル切替も使わない。
    models: MODELS.filter((model) => PUBLIC_MODELS.has(model.id)).map((model) => ({ ...model, fallback: false })),
    efforts: EFFORTS.filter((effort) => PUBLIC_EFFORTS.has(effort.id)),
    defaultModel, defaultEffort: defaultEffort as Effort,
    newRunsPerBrowserHour, newRunsPerAddressHour, newRunsPerHour, newRunsPerDay, maxOutputTokens, maxRounds,
    notice: `公開版はHaiku／Sonnet、エフォート「低／中」で利用できます。新しい依頼は全体で毎時${newRunsPerHour}回・24時間で${newRunsPerDay}回、同じ回線からは毎時${newRunsPerAddressHour}回までです。同じ会社の回線を使う方は接続元の枠を共有します。回数の制限は金額の上限ではありません。`,
  };
}

// 新規実行だけでなく、保存済みの会話・質問回答の再開でも確認する。
export function isAllowedUsageSelection(policy: UsagePolicy, model: string, effort: string): boolean {
  return policy.models.some((option) => option.id === model) && policy.efforts.some((option) => option.id === effort);
}
