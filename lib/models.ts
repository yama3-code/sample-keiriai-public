// 画面で選べるAIモデルとエフォート（考える深さ）の一覧
// ブラウザとサーバーの両方から使う（ここに秘密の情報は書かない）

export type ModelOption = {
  id: string;
  label: string;
  note: string;
  fallback: boolean; // 回答を断られたときに別モデルで答え直す機能（server-side fallback）に対応
  progressNotes: boolean; // ツールの合間の「進み具合のメモ」を返せる
};

export const MODELS: ModelOption[] = [
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    note: "速くて安い。定型的な作業向け（料金はSonnetの約1/20）",
    fallback: false,
    progressNotes: false,
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    note: "標準。速さと正確さのバランスが良い",
    fallback: true,
    progressNotes: true,
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    note: "高精度。判断が多い作業向け（料金はSonnetの約2倍）",
    fallback: true,
    progressNotes: true,
  },
  {
    id: "claude-fable-5-1",
    label: "Claude Fable 5.1",
    note: "最高性能。時間がかかる（料金はSonnetの約5倍）",
    fallback: true,
    progressNotes: true,
  },
];

export const EFFORTS = [
  { id: "low", label: "低", note: "速い・安い。単純な作業向け" },
  { id: "medium", label: "中", note: "標準" },
  { id: "high", label: "高", note: "じっくり考える。料金と時間が増える" },
  { id: "xhigh", label: "最高", note: "複雑な判断向け。料金と時間がさらに増える" },
  { id: "max", label: "最大", note: "正確さ最優先。最も時間と料金がかかる" },
] as const;

export type Effort = (typeof EFFORTS)[number]["id"];

export const DEFAULT_EFFORT: Effort = "medium";

// 環境変数 ANTHROPIC_MODEL を初期値にする。一覧にないモデルなら一覧の先頭に加える
export function modelOptions(defaultModel: string): ModelOption[] {
  if (MODELS.some((m) => m.id === defaultModel)) return MODELS;
  return [
    { id: defaultModel, label: defaultModel, note: "環境変数で指定したモデル", fallback: false, progressNotes: false },
    ...MODELS,
  ];
}

export function isEffort(value: string): value is Effort {
  return EFFORTS.some((e) => e.id === value);
}
