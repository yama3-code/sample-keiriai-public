import { loadTasks, type TaskDefinition } from "@/lib/tasks";
import { defaultMasters, validateMasters, masterList } from "@/lib/masters";
import { MASTER_KINDS, type MasterData } from "@/lib/master-types";
import { digestValue, randomId } from "@/lib/security";
import { securityCommand, SecurityUnavailableError } from "@/lib/security-store";
import { hasUnsupportedControlCharacters } from "@/lib/configuration-text";
import { CONFIGURATION_HISTORY_LIMIT, type ConfigurationChange, type ConfigurationHistoryDetail, type ConfigurationHistorySummary, type ConfigurationUpdate, type EditableConfiguration, type EditableTask, type TaskTextValues } from "@/lib/configuration-types";

type Snapshot = { tasks: EditableTask[]; masters: MasterData[] };
type HistoryEntry = { id: string; savedAt: string | null; description: string; snapshot: Snapshot };
type Stored = { revision: string; tasks: Record<string, TaskTextValues>; expenseRules?: string; masters?: MasterData[]; updatedAt: string; history?: HistoryEntry[]; protectedBaseline?: HistoryEntry; currentSnapshot?: "baseline" | { historyId: string } };
const STORE_KEY = "configuration:current";
const MAX_HISTORY_BYTES = 4_000_000;
const MAX_RECORD_BYTES = 6_000_000;
const MAX_RECORD_TRANSPORT_BYTES = 4_000_000;
const fields = ["name", "summary", "manual", "instructionPlaceholder"] as const;
const limits = { name: 100, summary: 1000, manual: 50_000, instructionPlaceholder: 2000 };
const isObject = (input: unknown): input is Record<string, unknown> => typeof input === "object" && input !== null && !Array.isArray(input);

export class ConfigurationError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
function requireSupportedText(values: string[]) {
  if (values.some(hasUnsupportedControlCharacters)) {
    throw new ConfigurationError("改行・タブ以外の制御文字が含まれています。内容を控え、貼り付け元を確認して、その文字を取り除いてから編集画面で保存してください。");
  }
}
function validTaskValues(value: unknown): value is TaskTextValues {
  return isObject(value) && Object.keys(value).length === fields.length
    && fields.every((field) => typeof value[field] === "string" && value[field].length <= limits[field])
    && String(value.name).trim().length > 0 && String(value.manual).trim().length > 0;
}
const validRules = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 50_000;
const validHistoryId = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validRestoreId = (value: unknown): value is string => value === "baseline" || value === "initial" || validHistoryId(value);
const validDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

function validateSnapshot(value: unknown): asserts value is Snapshot {
  if (!isObject(value) || !Array.isArray(value.tasks) || value.tasks.length > 100 || !Array.isArray(value.masters)) throw new Error("履歴の形式が不正です");
  const ids = new Set<string>();
  for (const task of value.tasks) {
    if (!isObject(task) || typeof task.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(task.id) || ids.has(task.id)) throw new Error("履歴の業務が不正です");
    const { id, ...values } = task;
    if (!validTaskValues(values)) throw new Error("履歴の手順が不正です");
    ids.add(id);
  }
  validateMasters(value.masters);
}

function validateHistory(value: unknown): asserts value is HistoryEntry[] {
  if (!Array.isArray(value) || value.length > CONFIGURATION_HISTORY_LIMIT || Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_HISTORY_BYTES) throw new Error("履歴の上限を超えています");
  const ids = new Set<string>();
  for (const entry of value) {
    if (!isObject(entry) || !validHistoryId(entry.id) || ids.has(entry.id) || (entry.savedAt !== null && !validDate(entry.savedAt))
      || typeof entry.description !== "string" || !entry.description.trim() || entry.description.length > 300) throw new Error("履歴の形式が不正です");
    validateSnapshot(entry.snapshot); ids.add(entry.id);
  }
}

function snapshotFor(stored: Stored | null, tasks: TaskDefinition[], baseMasters: MasterData[]): Snapshot {
  return {
    tasks: tasks.map(({ id, name, summary, manual, instructionPlaceholder }) => ({ id, name, summary, manual, instructionPlaceholder, ...stored?.tasks[id] })),
    masters: stored?.masters ?? baseMasters.map((master) => master.kind === "rules" ? { ...master, content: stored?.expenseRules ?? master.content } : master),
  };
}

function serializeStored(stored: Stored, tasks: TaskDefinition[], baseMasters: MasterData[]): string {
  // 保存済みの本文と一致する現在内容は参照で表し、復元のために履歴を削る必要をなくす。
  const current = JSON.stringify(snapshotFor(stored, tasks, baseMasters));
  const reference = stored.protectedBaseline && current === JSON.stringify(stored.protectedBaseline.snapshot) ? "baseline"
    : stored.history?.find((entry) => current === JSON.stringify(entry.snapshot))?.id;
  if (reference) {
    const compact: Stored = { ...stored, tasks: {}, currentSnapshot: reference === "baseline" ? reference : { historyId: reference } };
    delete compact.masters; delete compact.expenseRules;
    return JSON.stringify(compact);
  }
  return JSON.stringify(stored);
}

function storedForSnapshot(stored: Stored, snapshot: Snapshot): Stored {
  const candidate: Stored = { ...stored, tasks: Object.fromEntries(snapshot.tasks.map(({ id, ...values }) => [id, values])), masters: snapshot.masters };
  delete candidate.expenseRules; delete candidate.currentSnapshot;
  return candidate;
}

const transportSize = (serialized: string) => Buffer.byteLength(JSON.stringify(JSON.stringify(serialized)), "utf8");
const casTransportSize = (expected: string, value: string) => Buffer.byteLength(JSON.stringify(JSON.stringify({ expected, value })), "utf8");

function historySummary(entry: HistoryEntry, current: Snapshot): ConfigurationHistorySummary {
  // 復元では版番号だけが変わるため、現在と同じ本文の版を表示する。
  return { id: entry.id, savedAt: entry.savedAt, description: entry.description, isCurrent: JSON.stringify(entry.snapshot) === JSON.stringify(current) };
}

function availableHistory(stored: Stored | null, id: string, tasks: TaskDefinition[], baseMasters: MasterData[]): HistoryEntry {
  const entry = id === "initial" ? { id, savedAt: null, description: "配布時の初期値", snapshot: snapshotFor(null, tasks, baseMasters) }
    : id === "baseline" && stored?.protectedBaseline ? { ...stored.protectedBaseline, id, description: "上書きされない保護した控え" }
    : stored?.history?.find((item) => item.id === id);
  if (!entry) throw new ConfigurationError("履歴が見つからないか、保存件数の上限により取り除かれています。最新の内容を読み込んでください。", 404);
  // 業務の追加・削除後に、存在しない業務を復活させたり新しい業務を落としたりしない。
  if (entry.snapshot.tasks.length !== tasks.length || tasks.some((task) => !entry.snapshot.tasks.some((item) => item.id === task.id))) {
    throw new ConfigurationError("業務の構成が変わったため、この履歴をそのまま復元できません。必要な内容を確認して、編集画面から変更してください。", 409);
  }
  return entry;
}

function compareSnapshots(current: Snapshot, previous: Snapshot): ConfigurationChange[] {
  const changes: ConfigurationChange[] = [];
  const labels = { name: "業務名", summary: "説明", manual: "作業マニュアル", instructionPlaceholder: "補足指示の入力例" };
  for (const task of current.tasks) {
    const old = previous.tasks.find((item) => item.id === task.id)!;
    for (const field of fields) {
      if (task[field] !== old[field]) changes.push({ label: `${task.name}：${labels[field]}`, before: task[field], after: old[field] });
    }
  }
  const formatMaster = (master?: MasterData) => master ? `用途：${MASTER_KINDS[master.kind]}\nファイル：${master.filename}\n\n${master.content}` : "（データなし）";
  const ids = new Set([...current.masters.map((master) => master.id), ...previous.masters.map((master) => master.id)]);
  for (const id of ids) {
    const before = current.masters.find((master) => master.id === id);
    const after = previous.masters.find((master) => master.id === id);
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ label: `共通データ：${after?.name ?? before!.name}`, before: before ? `${before.name}\n${formatMaster(before)}` : formatMaster(), after: after ? `${after.name}\n${formatMaster(after)}` : formatMaster() });
  }
  return changes;
}

async function readStored(): Promise<{ stored: Stored | null; raw: string; version: string; tasks: TaskDefinition[]; baseMasters: MasterData[] }> {
  // 開発中は画面とAPIが別々に再読込されるため、モジュール初期化時の情報を使わない。
  // 版番号と表示・実行内容を、毎回同じ読み取り結果から組み立てる。
  const tasks = loadTasks();
  const baseMasters = defaultMasters();
  const baseVersion = digestValue("base-configuration", JSON.stringify({ tasks, masters: baseMasters }));
  const value = await securityCommand("get", STORE_KEY);
  const raw = typeof value === "string" ? value : "";
  if (Buffer.byteLength(raw, "utf8") > MAX_RECORD_BYTES) throw new SecurityUnavailableError();
  let stored: Stored | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isObject(parsed) || !isObject(parsed.tasks) || typeof parsed.revision !== "string" || typeof parsed.updatedAt !== "string"
        || (parsed.expenseRules !== undefined && !validRules(parsed.expenseRules))
        || !Object.values(parsed.tasks).every(validTaskValues)) throw new Error("保存内容の形式が不正です");
      if (parsed.masters !== undefined) validateMasters(parsed.masters);
      if (parsed.history !== undefined) validateHistory(parsed.history);
      if (parsed.protectedBaseline !== undefined) validateHistory([parsed.protectedBaseline]);
      if (parsed.currentSnapshot !== undefined) {
        // 参照形式には別の本文を混ぜない。壊れた参照を初期値で埋めて上書きしない。
        const reference = parsed.currentSnapshot;
        if (Object.keys(parsed.tasks).length || parsed.masters !== undefined || parsed.expenseRules !== undefined) throw new Error("保存内容の参照が不正です");
        const source = reference === "baseline" ? parsed.protectedBaseline as HistoryEntry | undefined
          : isObject(reference) && Object.keys(reference).length === 1 && validHistoryId(reference.historyId)
            ? (parsed.history as HistoryEntry[] | undefined)?.find((entry) => entry.id === reference.historyId) : undefined;
        if (!source) throw new Error("保存内容の参照先が不正です");
        parsed.tasks = Object.fromEntries(source.snapshot.tasks.map(({ id, ...values }) => [id, values]));
        parsed.masters = source.snapshot.masters;
        delete parsed.currentSnapshot;
      }
      stored = parsed as Stored;
    } catch { throw new SecurityUnavailableError(); }
  }
  return { stored, raw, tasks, baseMasters, version: digestValue("configuration-version", `${baseVersion}\0${raw}`) };
}

// 元ファイルは初期値として保ち、保存済みの文言をその都度重ねて読み込む。
export async function loadConfiguration() {
  const { stored, version, tasks, baseMasters } = await readStored();
  const masters = stored?.masters ?? baseMasters.map((m) => m.kind === "rules" ? { ...m, content: stored?.expenseRules ?? m.content } : m);
  const currentRules = masters.find((m) => m.kind === "rules")?.content ?? "";
  return {
    version,
    tasks: tasks.map((task) => ({ ...task, ...stored?.tasks[task.id] })),
    expenseRules: currentRules,
    masters,
    sharedData: masterList(masters),
    updatedAt: stored?.updatedAt ?? null,
  };
}
export async function editableConfiguration(): Promise<EditableConfiguration> {
  const { stored, version, tasks, baseMasters } = await readStored();
  const current = snapshotFor(stored, tasks, baseMasters);
  return { ...current, version, expenseRules: current.masters.find((master) => master.kind === "rules")?.content ?? "", updatedAt: stored?.updatedAt ?? null,
    history: stored?.history?.map((entry) => historySummary(entry, current)) ?? [],
    recovery: [
      ...(stored?.protectedBaseline ? [{ id: "baseline", savedAt: stored.protectedBaseline.savedAt, description: "上書きされない保護した控え", isCurrent: JSON.stringify(current) === JSON.stringify(stored.protectedBaseline.snapshot) }] : []),
      { id: "initial", savedAt: null, description: "配布時の初期値", isCurrent: JSON.stringify(current) === JSON.stringify(snapshotFor(null, tasks, baseMasters)) },
    ] };
}

export async function configurationHistory(id: string): Promise<ConfigurationHistoryDetail> {
  if (!validRestoreId(id)) throw new ConfigurationError("履歴の指定が正しくありません。");
  const { stored, version, tasks, baseMasters } = await readStored();
  const entry = availableHistory(stored, id, tasks, baseMasters);
  const changes = compareSnapshots(snapshotFor(stored, tasks, baseMasters), entry.snapshot);
  return { version, entry: { id: entry.id, savedAt: entry.savedAt, description: entry.description, isCurrent: !changes.length }, changes };
}

export async function saveConfiguration(input: unknown, beforeSave?: () => Promise<void>): Promise<EditableConfiguration> {
  const { stored, raw, version, tasks, baseMasters } = await readStored();
  if (!isObject(input) || typeof input.version !== "string") throw new ConfigurationError("保存内容が正しくありません。");
  if (input.target === "task") {
    if (Object.keys(input).some((key) => !["version", "target", "taskId", "values"].includes(key))
      || typeof input.taskId !== "string" || !tasks.some((task) => task.id === input.taskId)
      || !validTaskValues(input.values)) throw new ConfigurationError("業務名・説明・手順の内容を確認してください。業務名と手順は空欄にできません。");
  } else if (input.target === "masters") {
    if (Object.keys(input).some((key) => !["version", "target", "masters"].includes(key))) throw new ConfigurationError("保存内容が正しくありません");
    try { validateMasters(input.masters); } catch (error) { throw new ConfigurationError(error instanceof Error ? error.message : "共通データを確認してください"); }
  } else if (input.target === "rules") {
    if (Object.keys(input).some((key) => !["version", "target", "expenseRules"].includes(key)) || !validRules(input.expenseRules)) {
      throw new ConfigurationError("経費精算規程を入力してください（50,000文字まで）。");
    }
  } else if (input.target === "restore") {
    if (Object.keys(input).some((key) => !["version", "target", "historyId"].includes(key)) || !validRestoreId(input.historyId)) throw new ConfigurationError("復元する履歴を確認してください。");
  } else { throw new ConfigurationError("編集する項目が見つかりません。"); }
  const update = input as ConfigurationUpdate;
  if (update.version !== version) throw new ConfigurationError("ほかの画面で内容が更新されています。入力内容を控え、最新の内容を読み込んでから編集してください。", 409);
  // 過去の保存内容の読込は維持し、新しく受け付ける本文にだけ文字の制限を適用する。
  if (update.target === "task") requireSupportedText(Object.values(update.values));
  else if (update.target === "rules") requireSupportedText([update.expenseRules]);
  else if (update.target === "masters") requireSupportedText(update.masters.flatMap((master) => Object.values(master)));
  const next: Stored = { ...stored, tasks: { ...stored?.tasks }, revision: randomId(), updatedAt: new Date().toISOString() };
  const previous = snapshotFor(stored, tasks, baseMasters);
  let description: string;
  if (update.target === "task") { next.tasks[update.taskId] = update.values; description = `業務「${update.values.name}」を変更`; }
  else if (update.target === "masters") {
    next.masters = update.masters; delete next.expenseRules;
    const added = update.masters.filter((master) => !previous.masters.some((old) => old.id === master.id)).length;
    const removed = previous.masters.filter((master) => !update.masters.some((item) => item.id === master.id)).length;
    const changed = update.masters.filter((master) => { const old = previous.masters.find((item) => item.id === master.id); return old && JSON.stringify(old) !== JSON.stringify(master); }).length;
    description = `共通データを変更（追加${added}件・変更${changed}件・削除${removed}件）`;
  }
  else if (update.target === "restore") {
    const entry = availableHistory(stored, update.historyId, tasks, baseMasters);
    // 古い制御文字入りの版を、通常履歴から再適用して入力制限を迂回させない。
    // 固定控えの明示的な復旧は、旧形式の内容へ戻す互換性を維持する。
    if (validHistoryId(update.historyId)) requireSupportedText([
      ...entry.snapshot.tasks.flatMap((task) => Object.values(task)),
      ...entry.snapshot.masters.flatMap((master) => Object.values(master)),
    ]);
    if (!compareSnapshots(previous, entry.snapshot).length) throw new ConfigurationError("現在と同じ内容のため、復元する必要はありません。");
    next.tasks = Object.fromEntries(entry.snapshot.tasks.map(({ id, ...values }) => [id, values]));
    next.masters = entry.snapshot.masters; delete next.expenseRules;
    description = update.historyId === "initial" ? "配布時の初期値を復元"
      : update.historyId === "baseline" ? "保護した控えの内容を復元"
      : `${entry.savedAt ? new Date(entry.savedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "記録開始時"}の内容を復元`;
  }
  else {
    description = "経費精算規程を変更";
    next.expenseRules = update.expenseRules;
    if (next.masters) {
      if (!next.masters.some((m) => m.kind === "rules")) throw new ConfigurationError("経費精算規程が削除されています。マスタ設定から追加してください。");
      next.masters = next.masters.map((m) => m.kind === "rules" ? { ...m, content: update.expenseRules } : m);
    }
  }
  // 規程編集からの変更でも、共通データ全体の上限と整合を必ず確認する。
  if (next.masters) {
    try { validateMasters(next.masters); } catch (error) { throw new ConfigurationError(error instanceof Error ? error.message : "共通データを確認してください"); }
    delete next.expenseRules;
  }
  const baseline: HistoryEntry[] = stored?.history?.length ? stored.history : [{ id: randomId(), savedAt: stored?.updatedAt ?? null, description: "履歴の記録開始時の内容", snapshot: previous }];
  // 最初の変更前の控えは、通常履歴の件数・容量整理でも捨てたり差し替えたりしない。
  // 旧形式では既に残っている最古版を引き継ぐ。消えた過去の版は作り直せない。
  next.protectedBaseline = stored?.protectedBaseline ?? baseline[baseline.length - 1];
  const entry: HistoryEntry = { id: next.revision, savedAt: next.updatedAt, description, snapshot: snapshotFor(next, tasks, baseMasters) };
  // 復元の往復で新しい履歴を増やし、正しい改訂を押し出すことを防ぐ。
  // 元の保存日時・ID・順序を保ち、復元の最終更新日時は現在の設定だけに記録する。
  next.history = update.target === "restore" ? [...stored?.history ?? []] : [entry, ...baseline].slice(0, CONFIGURATION_HISTORY_LIMIT);
  // 通常保存の時点で初期値・固定控えへの復旧容量も確保する。
  // 復元では既存の履歴を削らず、初めて固定控えを作る旧形式からの移行だけ整理を許す。
  const needsHistoryTrimming = () => {
    const serialized = serializeStored(next, tasks, baseMasters);
    const candidates = update.target === "restore" ? [serialized] : [
      serialized,
      serializeStored(storedForSnapshot(next, snapshotFor(null, tasks, baseMasters)), tasks, baseMasters),
      serializeStored(storedForSnapshot(next, next.protectedBaseline!.snapshot), tasks, baseMasters),
    ];
    return Buffer.byteLength(JSON.stringify(next.history), "utf8") > MAX_HISTORY_BYTES
      || candidates.some((value) => transportSize(value) > MAX_RECORD_TRANSPORT_BYTES || casTransportSize(serialized, value) > 9_000_000);
  };
  if (update.target !== "restore" || !stored?.protectedBaseline) {
    while (next.history.length > 0 && needsHistoryTrimming()) next.history.pop();
  }
  try { validateHistory(next.history); } catch { throw new ConfigurationError("履歴に残せる内容の量を超えました。手順や共通データを整理してから保存してください。"); }
  const serialized = serializeStored(next, tasks, baseMasters);
  if (Buffer.byteLength(serialized, "utf8") > MAX_RECORD_BYTES || needsHistoryTrimming()) throw new ConfigurationError("保存内容と履歴の合計が上限を超えています。履歴は削除せず保持しています。設定を書き出し、管理者に確認してください。");
  const casValue = JSON.stringify({ expected: raw, value: serialized });
  if (Buffer.byteLength(JSON.stringify(casValue), "utf8") > 9_000_000) throw new ConfigurationError("保存先へ送る内容が上限を超えています。管理者に確認してください。");
  // 入力・版・履歴を検証してから、受け付けた保存の利用枠を呼出し元で確認する。
  await beforeSave?.();
  const saved = await securityCommand("cas", STORE_KEY, casValue);
  if (saved !== 1) throw new ConfigurationError("ほかの画面で内容が更新されました。最新の内容を読み込んでください。", 409);
  return editableConfiguration();
}
