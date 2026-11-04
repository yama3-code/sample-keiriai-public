import { checkConversationFiles, checkConversationSize, invalidateConversation, consumeConversation, ConversationError, MAX_CONVERSATION_TURNS, readConversation, sealConversation, TURN_DURATION_MS, type Continuation, type ConversationTicket } from "@/lib/conversation";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { createClaudeClient } from "@/lib/claude-client";
import { rememberVisitor, visitorForRequest, type Visitor } from "@/lib/visitors";
import { checkEntries, parseResult, submitResultTool, toCsv, UnsafeCsvError } from "@/lib/journal";
import { masterChecks, masterPrompt } from "@/lib/masters";
import { agentInstructions } from "@/lib/knowledge";
import { isEffort } from "@/lib/models";
import { isAllowedUsageSelection, loadUsagePolicy } from "@/lib/usage-policy";
import { extractGeneratedFileIds } from "@/lib/container-files";
import type { TaskDefinition } from "@/lib/tasks";
import { loadConfiguration } from "@/lib/configuration";
import { consumeRunState, FILE_TTL_SECONDS, MAX_QUESTIONS, MAX_ROUNDS, readRunState, sealRunState, type RunState } from "@/lib/run-state";
import { acquireRunLease, isSameOrigin, limitRequestTraffic, limitTogether, readLimitedBody, requestAddress, securityErrorResponse } from "@/lib/security";
import { attachmentBlocks, claimUploadBatch, readUploadBatch, UploadError, type StagedFile } from "@/lib/uploads";
import { GENERAL_INSTRUCTION_LIMIT, MAX_TASK_FILES } from "@/lib/upload-types";
import { exportTables, parseGeneralResult, submitGeneralResultTool, type ExportTable } from "@/lib/general-result";

// 業務の実行には数分かかることがあるため、最大5分まで待つ
export const maxDuration = 300;

const MAX_FILE_BYTES = 1024 * 1024; // アップロードできるCSVは1ファイル1MBまで

// 担当者に質問するためのツール
const askUserTool = {
  name: "ask_user",
  description:
    "作業を続けるために担当者の判断や情報が必要なときに、担当者へ質問する。回答が返ってくるまで作業は止まる。1回の呼び出しで質問は1つ。",
  strict: true,
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["question", "options"],
    properties: {
      question: {
        type: "string",
        description: "質問文。どのデータのどの点で迷っているか、なぜ確認が必要かを1〜3文で具体的に書く",
      },
      options: {
        type: "array",
        items: { type: "string" },
        description: "回答の選択肢（2〜4個）。担当者は選択肢以外の自由回答もできる。自由回答のみが適切なら空の配列",
      },
    },
  },
};

const questionGuide = `# 担当者への質問について
- 作業を続けるのに担当者の判断や情報が必要で、担当者がその場で答えられそうなこと（例：対象期間が分からない、データの不備をどう扱うか、マニュアルの読み方が2通りある）は、ask_user ツールで質問してかまいません。
- マニュアルが「要確認とする」と定めている事項でも、担当者に聞けば解決できそうなら質問してかまいません。
- 質問は作業全体で${MAX_QUESTIONS}回までです。似た質問はまとめず、1回に1つずつ聞いてください。
- 担当者の回答で処理した事項は、作業ログに「担当者に確認：（質問の要点）→ 回答：（回答）」と記録してください。
- 回答が「分からない」「要確認にして」などの場合は、仕訳にせず要確認事項に回してください。`;

const noQuestionGuide = `# 担当者への質問について
- 今回は担当者に質問できません。判断に迷うことは、仕訳にせず要確認事項に記載してください。`;

export type Question = { id: string; question: string; options: string[] };

// 画面に送るイベント（1行に1つのJSON）
export type RunEvent =
  | { type: "status"; message: string }
  | { type: "note"; text: string }
  | { type: "code"; title: string }
  | { type: "code_result"; ok: boolean; output: string }
  | { type: "question"; questions: Question[]; state: string; continuation?: Continuation }
  | { type: "result"; result: NonNullable<ReturnType<typeof parseResult>>; checks: ReturnType<typeof checkEntries>; csv: string; report?: string; tables?: ExportTable[]; continuation?: Continuation; continuationNotice?: string }
  | { type: "error"; message: string };

// Excel で保存した CSV（Shift_JIS）にも対応して文字列にする
function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

// コードの中から「# 手順2: …」のような見出しを取り出す
function codeTitle(name: string, input: string): string {
  try {
    const parsed = JSON.parse(input) as { command?: string; path?: string; file_text?: string };
    const text = `${parsed.command ?? ""}\n${parsed.file_text ?? ""}`;
    const step = text.match(/#\s*(手順[^\n"\\]*)/);
    if (step) return step[1].trim();
    if (name === "text_editor_code_execution" && parsed.path) return `ファイル操作：${parsed.path}`;
  } catch {
    // 途中で途切れた入力などは見出しなしで扱う
  }
  return "コードを実行";
}

const tail = (s: string, max = 600) => (s.length > max ? `…${s.slice(-max)}` : s);

const isAskUser = (b: Anthropic.Beta.BetaContentBlock | Anthropic.Beta.BetaContentBlockParam) =>
  b.type === "tool_use" && b.name === "ask_user";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "送信元を確認できません" }, { status: 403 });
  if (request.signal.aborted) return Response.json({ error: "送信を中止しました。必要な場合は改めて実行してください。" }, { status: 408 });
  try {
    const session = visitorForRequest(request);
    await limitRequestTraffic(request, "run", requestAddress(request));
    return rememberVisitor(await runForVisitor(request, session), session);
  } catch (error) {
    if (error instanceof ConversationError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof UploadError) return Response.json({ error: error.message }, { status: error.status });
    return securityErrorResponse(error);
  }
}

async function runForVisitor(request: Request, session: Visitor) {
  const policy = loadUsagePolicy();
  const resolveModel = (requested: string) => policy.models.find((model) => model.id === requested);
  const maximumRounds = Math.min(MAX_ROUNDS, policy.maxRounds);
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "サーバーに ANTHROPIC_API_KEY が設定されていません" }, { status: 500 });
  }

  const bytes = await readLimitedBody(request, 10 * MAX_FILE_BYTES);
  const form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") || "" } })
    .formData().catch(() => null);
  if (!form) return Response.json({ error: "送信内容が正しくありません" }, { status: 400 });

  const client = createClaudeClient();
  const configuration = await loadConfiguration();
  const sharedDataPrompt = masterPrompt(configuration.masters);
  let state: RunState;
  let task: TaskDefinition | undefined;
  let newInputs: { label: string; file: string; text: string; isSample: boolean }[] | null = null;
  let generalBatchId: string | null = null;
  let generalFiles: StagedFile[] = [];
  let stagedInputs: string[] = [];
  let instructions = "";
  let resumeCheckpoint: RunState | null = null;
  let resumeTicket: Awaited<ReturnType<typeof readRunState>> = null;

  let conversationTicket: ConversationTicket | null = null;
  let isFollowup = false;
  const followupRaw = form.get("followup");
  const resumeRaw = form.get("resume");
  if ((typeof followupRaw === "string" || typeof resumeRaw === "string") && ([...form.values()].some((value) => value instanceof File) || form.has("uploadBatch"))) {
    return Response.json({ error: "追加依頼や回答では資料を追加できません。「新しい依頼」から送信してください。" }, { status: 400 });
  }
  if (typeof followupRaw === "string" && typeof resumeRaw === "string") return Response.json({ error: "送信内容が正しくありません" }, { status: 400 });
  if (typeof followupRaw === "string") {
    conversationTicket = await readConversation(followupRaw, session.id, "result");
    state = structuredClone(conversationTicket.state);
    task = configuration.tasks.find((item) => item.id === state.taskId && item.mode === "general");
    if (!task || !isAllowedUsageSelection(policy, state.model, state.effort)) throw new ConversationError("選べるAI設定が変わりました。「新しい依頼」から始めてください。");
    if (state.configurationVersion !== configuration.version) throw new ConversationError("マスタや業務ルールが変わりました。最新の内容で「新しい依頼」から実行してください。");
    if ((state.turns ?? 1) >= MAX_CONVERSATION_TURNS) throw new ConversationError("依頼は初回を含め6回までです。「新しい依頼」から始めてください。");
    instructions = String(form.get("instructions") ?? "").trim();
    if (!instructions || instructions.length > GENERAL_INSTRUCTION_LIMIT) return Response.json({ error: "追加依頼は1〜10,000文字で入力してください" }, { status: 400 });
    const last = state.messages[state.messages.length - 1];
    if (last.role !== "assistant" || !Array.isArray(last.content)) throw new ConversationError();
    const toolResults = last.content.filter((b): b is Anthropic.Beta.BetaToolUseBlockParam => b.type === "tool_use").map((b) => ({ type: "tool_result" as const, tool_use_id: b.id, content: "前回の提出結果を担当者に表示しました。" }));
    state.messages.push({ role: "user", content: [...toolResults, { type: "text", text: `追加依頼：${instructions}\n過去の結果を正解と固定せず、必要に応じ元資料から再計算・照合してください。資料を利用できない場合は前の結果だけで処理せず停止し、新しい依頼を案内してください。` }] });
    state.turns = (state.turns ?? 1) + 1;
    state.roundsUsed = 0; state.questionsAsked = 0; state.nudged = false;
    state.executionDeadline = Date.now() + TURN_DURATION_MS;
    checkConversationSize(state);
    isFollowup = true;
  } else
  if (typeof resumeRaw === "string") {
    // ---- 質問への回答を受けて再開する ----
    let encrypted = false;
    try { encrypted = typeof JSON.parse(resumeRaw)?.conversation === "string"; } catch { /* 旧形式の検証に回す。 */ }
    if (encrypted) conversationTicket = await readConversation(resumeRaw, session.id, "question");
    else resumeTicket = await readRunState(resumeRaw, session.id);
    const parsed = conversationTicket?.state ?? resumeTicket?.state;
    task = parsed ? configuration.tasks.find((item) => item.id === parsed.taskId) : undefined;
    if (!parsed || !task || !isAllowedUsageSelection(policy, parsed.model, parsed.effort)) {
      return Response.json({ error: "作業の途中経過を読み込めませんでした。最初から実行してください。" }, { status: 400 });
    }
    if (parsed.configurationVersion !== configuration.version) {
      return Response.json({ error: "作業の途中でルールが更新されました。画面を再読み込みし、最新のルールで最初から実行してください。" }, { status: 409 });
    }
    if (task.mode === "general" && !conversationTicket) throw new ConversationError();
    resumeCheckpoint = structuredClone(parsed);
    state = parsed;
    let answers: Record<string, string>;
    try {
      const input: unknown = JSON.parse(String(form.get("answers") ?? "{}"));
      if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("回答の形式が不正です");
      answers = input as Record<string, string>;
    } catch {
      answers = {};
    }
    const last = state.messages[state.messages.length - 1];
    const asks = last?.role === "assistant" && Array.isArray(last.content) ? last.content.filter(isAskUser) : [];
    if (asks.length === 0) {
      return Response.json({ error: "回答する質問が見つかりません" }, { status: 400 });
    }
    state.messages.push({
      role: "user",
      content: asks.map((b) => {
        const id = (b as Anthropic.Beta.BetaToolUseBlockParam).id;
        const answer = String(answers[id] ?? "").trim().slice(0, 2000);
        return {
          type: "tool_result" as const,
          tool_use_id: id,
          content: answer ? `担当者の回答：${answer}` : "担当者は回答しませんでした。要確認事項に記載してください。",
        };
      }),
    });
  } else {
    // ---- 新しく実行する ----
    task = configuration.tasks.find((item) => item.id === String(form.get("taskId") ?? ""));
    if (!task) return Response.json({ error: "業務が見つかりません" }, { status: 400 });
    const shownVersion = form.get("configurationVersion");
    if (typeof shownVersion === "string" && shownVersion !== configuration.version) {
      return Response.json({ error: "ルールが更新されています。画面を再読み込みしてから実行してください。" }, { status: 409 });
    }
    const model = resolveModel(String(form.get("model") || policy.defaultModel));
    if (!model) return Response.json({ error: "選べないモデルが指定されました" }, { status: 400 });
    const effort = String(form.get("effort") || policy.defaultEffort);
    if (!isEffort(effort) || !isAllowedUsageSelection(policy, model.id, effort)) return Response.json({ error: "選べないエフォートが指定されました" }, { status: 400 });
    instructions = String(form.get("instructions") ?? "").trim();
    const instructionLimit = task.mode === "general" ? GENERAL_INSTRUCTION_LIMIT : 2000;
    if (instructions.length > instructionLimit) return Response.json({ error: `依頼内容は${instructionLimit.toLocaleString("ja-JP")}文字までです` }, { status: 400 });
    if (task.mode === "general" && !instructions) return Response.json({ error: "AI経理エージェントに依頼したい内容を入力してください" }, { status: 400 });
    if (task.mode === "general") {
      if ([...form.values()].some((value) => value instanceof File)) return Response.json({ error: "添付ファイルはアップロード機能から送信してください" }, { status: 400 });
    }
    const batch = form.get("uploadBatch");
    if (typeof batch === "string" && batch) generalBatchId = batch;
    if (generalBatchId && [...form.values()].some((value) => value instanceof File)) {
      return Response.json({ error: "添付の送信方法を混在させないでください" }, { status: 400 });
    }
    if (task.mode !== "general" && generalBatchId) {
      let parsed: unknown;
      try { parsed = JSON.parse(String(form.get("inputIds") || "[]")); } catch { parsed = null; }
      if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string" && task!.inputs.some((input) => input.id === id))) {
        return Response.json({ error: "入力データの種類が正しくありません" }, { status: 400 });
      }
      stagedInputs = parsed;
    }
    if (task.mode !== "general" && [...form.entries()].some(([key, value]) => value instanceof File && !task!.inputs.some((input) => key === `file_${input.id}`))) {
      return Response.json({ error: "入力データの種類が正しくありません" }, { status: 400 });
    }
    const directCount = [...form.values()].filter((value) => value instanceof File && value.size > 0).length;
    if (task.mode !== "general" && directCount > MAX_TASK_FILES) return Response.json({ error: "添付できるファイルは10個までです" }, { status: 400 });

    // 入力データ：アップロードされたファイルがあればそれを、なければサンプルを使う
    newInputs = [];
    for (const input of task.inputs) {
      if (stagedInputs.includes(input.id)) continue;
      const selected = form.getAll(`file_${input.id}`).filter((value): value is File => value instanceof File && value.size > 0);
      if (selected.length) {
        for (const [index, uploaded] of selected.entries()) {
          if (uploaded.size > MAX_FILE_BYTES || !uploaded.name.toLowerCase().endsWith(".csv")) {
            return Response.json({ error: `「${input.label}」は1ファイル1MBまでのCSVを選んでください` }, { status: 400 });
          }
          newInputs.push({ label: `${input.label}／元ファイル：${uploaded.name}`, file: `input_${input.id}_${index + 1}.csv`, text: decodeCsv(await uploaded.arrayBuffer()), isSample: false });
        }
      } else {
        newInputs.push({ label: input.label, file: input.file, text: task.samples[input.id], isSample: true });
      }
    }

    state = {
      taskId: task.id,
      model: model.id,
      effort,
      allowQuestions: form.get("allowQuestions") !== "false",
      messages: [],
      fileIds: [],
      nudged: false,
      questionsAsked: 0,
      roundsUsed: 0,
      expiresAt: Date.now() + FILE_TTL_SECONDS * 1000,
      configurationVersion: configuration.version,
      ...(task.mode === "general" ? { conversationId: undefined, turns: 1, executionDeadline: Date.now() + TURN_DURATION_MS } : {}),
    };
  }

  const currentTask = task;
  const model = resolveModel(state.model)!;
  const encoder = new TextEncoder();
  const rememberOutputs = (content: unknown) => {
    state.outputFileIds = [...new Set([...(state.outputFileIds ?? []), ...extractGeneratedFileIds(content).filter((id) => !state.fileIds.includes(id))])];
  };
  const validateBatch = (candidate: Awaited<ReturnType<typeof readUploadBatch>>) => {
    if (currentTask.mode === "general") {
      if (candidate.taskId) throw new UploadError("別の業務の添付情報は使用できません。");
    } else {
      const actualIds = [...new Set(candidate.files.map((file) => file.inputId))].sort();
      if (candidate.taskId !== currentTask.id || candidate.files.length > MAX_TASK_FILES
        || candidate.files.some((file) => file.mime !== "text/csv" || file.size > MAX_FILE_BYTES || !currentTask.inputs.some((input) => input.id === file.inputId))
        || JSON.stringify(actualIds) !== JSON.stringify([...new Set(stagedInputs)].sort())) {
        throw new UploadError("添付ファイルの種類または個数を確認してください（合計10個まで）。");
      }
    }
  };
  // 不正な添付券や別人の資料で、正しい利用者の業務枠を消費させない。
  if (generalBatchId) validateBatch(await readUploadBatch(generalBatchId, session.id));
  const release = await acquireRunLease(session.id);
  try {
    if (currentTask.mode === "general" && (state.executionDeadline ?? 0) <= Date.now()) throw new ConversationError("この依頼の実行期限（5分）が過ぎました。「新しい依頼」から始めてください。", 408);
    // 並列送信の待ち時間中に別の処理が券を使っていないか、利用枠の計上前に再確認する。
    if (conversationTicket) await readConversation(conversationTicket.raw, session.id, conversationTicket.phase);
    else if (resumeTicket && !await readRunState(String(resumeRaw), session.id)) throw new ConversationError("この回答はすでに送信済みです。最新の画面から確認してください。");
    if (generalBatchId) validateBatch(await readUploadBatch(generalBatchId, session.id));
    if (conversationTicket) await checkConversationFiles(state, client);
    request.signal.throwIfAborted();
    const address = requestAddress(request);
    const isNewRequest = !resumeTicket && (!conversationTicket || isFollowup);
    await limitTogether("accepted", [
      { key: `run:session:${session.id}`, count: 30, seconds: 3600 },
      { key: `run:address:${address}`, count: 30, seconds: 3600 },
      { key: "run:global", count: 60, seconds: 3600 },
      ...(isNewRequest ? [
        { key: `new-run:session:${session.id}`, count: policy.newRunsPerBrowserHour, seconds: 3600 },
        { key: `new-run:address:${address}`, count: policy.newRunsPerAddressHour, seconds: 3600 },
        { key: "new-run:global", count: policy.newRunsPerHour, seconds: 3600 },
        { key: "new-run:daily", count: policy.newRunsPerDay, seconds: 86400 },
      ] : []),
    ]);
    if (conversationTicket && !isFollowup) {
      await consumeConversation(conversationTicket, session.id);
    } else if (resumeTicket) {
      if (!(await consumeRunState(resumeTicket.nonce, resumeTicket.signature))) {
        await release();
        return Response.json({ error: "この回答はすでに送信済みか、有効期限を過ぎています。最初から実行してください。" }, { status: 409 });
      }
    } else {
      if (isFollowup && conversationTicket) {
        await consumeConversation(conversationTicket, session.id);
      }
      if (generalBatchId) {
        const batch = await claimUploadBatch(generalBatchId, session.id, validateBatch);
        generalFiles = batch.files;
        state.fileIds = generalFiles.map((file) => file.fileId);
        state.expiresAt = Math.min(state.expiresAt, batch.expiresAt);
      }
    }
  } catch (error) { await release(); throw error; }

  // 通信切断・5分経過時は、Claudeとの通信も止める。
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) abort.abort();
  const timeout = setTimeout(() => abort.abort(), Math.max(1, Math.min(maxDuration * 1000, state.expiresAt - Date.now(), state.executionDeadline ? state.executionDeadline - Date.now() : Infinity)));
  let streamCancelled = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) => { if (!streamCancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")); };
      let waitingForAnswer = false;
      let receivedEvents = false;

      try {
        abort.signal.throwIfAborted();
        if (newInputs) {
          // 入力データをコード実行環境に渡すため、Anthropic にアップロードする
          send({ type: "status", message: `入力データを準備しています（${model.label}・エフォート ${state.effort}）` });
          for (const input of newInputs) {
            const meta = await client.files.upload({
              file: await toFile(Buffer.from(input.text, "utf8"), input.file, { type: "text/csv" }),
              expires_in_seconds: FILE_TTL_SECONDS,
            }, { signal: abort.signal });
            state.fileIds.push(meta.id);
          }
          const fileList = [
            ...newInputs.map((i) => `- ${i.file}：${i.label}${i.isSample ? "（サンプルデータ）" : ""}`),
            ...generalFiles.map((file) => {
              const input = currentTask.inputs.find((input) => input.id === file.inputId);
              const label = input ? `${input.label}（マニュアル上：${input.file}）` : "添付";
              return `- ${file.filename}：${label}／元ファイル：${file.name}`;
            }),
          ].join("\n") || "（添付なし）";
          state.messages.push({
            role: "user",
            content: [
              {
                type: "text",
                text: `業務「${currentTask.name}」を、作業マニュアルのとおりに実行してください。\n\n# 入力ファイル\n${fileList}\n\n同じ種類の複数ファイルは、列構成・対象期間・重複を確認して全件を処理してください。参照用マスタが複数ある場合は、同じキーの矛盾を勝手に統合せず質問または要確認に回してください。作業ログに元ファイル名ごとの処理件数・金額・保留理由を残し、仕訳の摘要にも元ファイル名と元行番号を記載してください。\n\n# 担当者からの${currentTask.mode === "general" ? "依頼内容" : "補足指示"}\n${instructions || "（なし）"}\n\n${state.allowQuestions ? questionGuide : noQuestionGuide}`,
              },
              ...(currentTask.mode === "general" ? attachmentBlocks(generalFiles) : state.fileIds.map((id) => ({ type: "container_upload" as const, file_id: id }))),
            ],
          });
          send({ type: "status", message: "エージェントが作業マニュアルを読んでいます" });
        } else {
          send({ type: "status", message: isFollowup ? "元資料と会話を引き継いで追加依頼を実行します" : "回答を受け取りました。作業を再開します" });
        }

        const betas: Anthropic.Beta.AnthropicBeta[] = [];
        if (model.fallback) betas.push("server-side-fallback-2026-07-01");
        if (model.progressNotes) betas.push("thinking-display-updates-2026-08-18");
        const tools = [
          { type: "code_execution_20260521" as const, name: "code_execution" as const },
          currentTask.mode === "general" ? submitGeneralResultTool : submitResultTool,
          ...(state.allowQuestions ? [askUserTool] : []),
        ];

        for (; state.roundsUsed < maximumRounds;) {
          abort.signal.throwIfAborted();
          // 質問後に再開しても、作業全体の回数を引き継ぐ。
          if (currentTask.mode === "general") checkConversationSize(state);
          state.roundsUsed++;
          const stream = client.beta.messages.stream({
            model: model.id,
            max_tokens: policy.maxOutputTokens,
            output_config: { effort: state.effort },
            ...(model.progressNotes ? { thinking: { type: "adaptive" as const, display: "updates" as const } } : {}),
            ...(model.fallback ? { fallbacks: "default" as const } : {}),
            ...(betas.length ? { betas } : {}),
            ...(state.containerId ? { container: state.containerId } : {}),
            system: [
              { type: "text", text: agentInstructions },
              {
                type: "text",
                text: `${sharedDataPrompt}\n\n<manual title="作業マニュアル：${currentTask.name}">\n${currentTask.manual}\n</manual>`,
                // 共通データとマニュアルは毎回同じなのでキャッシュし、料金を下げる
                cache_control: { type: "ephemeral" },
              },
            ],
            tools,
            messages: state.messages,
          }, { signal: abort.signal });

          // 進み具合を画面に送る（ブロックごとに中身をためて、終わったら送る）
          const blocks = new Map<number, { kind: string; name: string; buffer: string }>();
          for await (const event of stream) {
            receivedEvents = true;
            if (event.type === "content_block_start") {
              const block = event.content_block as { type: string; name?: string; content?: unknown };
              rememberOutputs(block);
              blocks.set(event.index, { kind: block.type, name: block.name ?? "", buffer: "" });
              if (block.type === "bash_code_execution_tool_result") {
                const result = block.content as { type: string; return_code?: number; stdout?: string; stderr?: string };
                if (result.type === "bash_code_execution_result") {
                  const ok = result.return_code === 0;
                  send({ type: "code_result", ok, output: tail(ok ? result.stdout ?? "" : result.stderr || result.stdout || "") });
                } else {
                  if (currentTask.mode === "general" && isFollowup) throw new ConversationError("元資料または実行環境を利用できません。「新しい依頼」から始めてください。");
                  send({ type: "code_result", ok: false, output: "コードを実行できませんでした" });
                }
              }
            } else if (event.type === "content_block_delta") {
              const current = blocks.get(event.index);
              if (!current) continue;
              const delta = event.delta as { type: string; text?: string; thinking?: string; partial_json?: string };
              if (delta.type === "text_delta") current.buffer += delta.text ?? "";
              else if (delta.type === "thinking_delta") current.buffer += delta.thinking ?? "";
              else if (delta.type === "input_json_delta") current.buffer += delta.partial_json ?? "";
            } else if (event.type === "content_block_stop") {
              const current = blocks.get(event.index);
              if (!current) continue;
              if ((current.kind === "text" || current.kind === "thinking") && current.buffer.trim()) {
                send({ type: "note", text: current.buffer.trim() });
              } else if (current.kind === "server_tool_use") {
                send({ type: "code", title: codeTitle(current.name, current.buffer) });
              } else if (current.kind === "tool_use" && current.name === "submit_result") {
                send({ type: "status", message: "結果をまとめています" });
              }
            }
          }

          const final = await stream.finalMessage();
          rememberOutputs(final.content);
          // 画面からは生成ファイルを配らないため、Files API側の成果物は取得直後から削除を試みる。
          // 作業用コンテナ内のコピーには、Anthropic側の別の保持期間が適用される。
          const outputIds = state.outputFileIds ?? [];
          const removedOutputs = await Promise.allSettled(outputIds.map((id) => client.files.delete(id, {}, { signal: AbortSignal.timeout(5000) })));
          state.outputFileIds = outputIds.filter((_, index) => removedOutputs[index].status === "rejected");
          if (currentTask.mode === "general" && final.container) {
            const expiry = Date.parse(final.container.expires_at);
            if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new ConversationError("実行環境の期限を確認できません。「新しい依頼」から実行してください。");
            state.expiresAt = Math.min(state.expiresAt, expiry);
          }
          state.containerId = final.container?.id ?? state.containerId;
          const assistantTurn = {
            role: "assistant" as const,
            content: final.content as Anthropic.Beta.BetaContentBlockParam[],
          };

          const submit = final.content.find(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_result",
          );
          if (submit) {
            const general = currentTask.mode === "general" ? parseGeneralResult(submit.input) : null;
            const result = currentTask.mode === "general" ? general : parseResult(submit.input);
            if (!result) {
              send({ type: "error", message: "エージェントの提出内容の形式が正しくありませんでした。もう一度実行してください。" });
            } else {
              send({ type: "status", message: "結果を確認しています" });
              const checked = { checks: checkEntries(result.entries, masterChecks(configuration.masters)), csv: toCsv(result.entries) };
              let continuation: Continuation | undefined;
              let continuationNotice: string | undefined;
              if (general) {
                await checkConversationFiles(state, client);
                state.messages.push(assistantTurn);
                if ((state.turns ?? 1) < MAX_CONVERSATION_TURNS) {
                  try {
                    continuation = await sealConversation(state, session.id, "result");
                    waitingForAnswer = true;
                  } catch (error) {
                    continuationNotice = error instanceof ConversationError ? error.message : "継続情報を作れませんでした。新しい依頼から始めてください。";
                  }
                } else continuationNotice = "初回を含め6回の上限に達しました。続きは「新しい依頼」から始めてください。";
              }
              send({ type: "result", result, ...checked,
                ...(general ? { report: general.report, tables: exportTables(general.tables), continuation, continuationNotice } : {}),
              });
            }
            return;
          }

          const asks = final.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "ask_user",
          );
          if (asks.length > 0) {
            state.messages.push(assistantTurn);
            if (state.roundsUsed >= maximumRounds) {
              send({ type: "error", message: "作業の回数が上限に達したため中断しました。" });
              return;
            }
            if (state.questionsAsked + asks.length > MAX_QUESTIONS) {
              // 質問の上限を超えたら、担当者には聞かずに要確認へ回してもらう
              state.messages.push({
                role: "user",
                content: asks.map((b) => ({
                  type: "tool_result" as const,
                  tool_use_id: b.id,
                  content: "質問の上限に達しました。この件は要確認事項に記載して、作業を続けてください。",
                })),
              });
              continue;
            }
            state.questionsAsked += asks.length;
            const questions = asks.map((b) => {
              const input = b.input as { question?: unknown; options?: unknown };
              return {
                id: b.id,
                question: typeof input.question === "string" ? input.question : "（質問文がありません）",
                options: Array.isArray(input.options) ? input.options.filter((o): o is string => typeof o === "string").slice(0, 6) : [],
              };
            });
            // 履歴は画面側で預かり、サーバーには改変検知・再送防止用の値だけを保管する。
            if (currentTask.mode === "general") await checkConversationFiles(state, client);
            const continuation = currentTask.mode === "general" ? await sealConversation(state, session.id, "question") : undefined;
            const signedState = continuation?.ticket ?? await sealRunState(state, session.id);
            send({ type: "question", questions, state: signedState, ...(continuation ? { continuation } : {}) });
            waitingForAnswer = !abort.signal.aborted;
            return;
          }

          if (final.stop_reason === "pause_turn") {
            // コード実行が長くなり一時停止しただけなので、そのまま続きを依頼する
            state.messages.push(assistantTurn);
            continue;
          }
          if (final.stop_reason === "end_turn" && !state.nudged) {
            state.nudged = true;
            state.messages.push(assistantTurn);
            state.messages.push({ role: "user", content: "作業が終わっていれば、submit_result ツールで結果を提出してください。" });
            continue;
          }
          if (final.stop_reason === "refusal") {
            send({ type: "error", message: "この依頼は処理できませんでした。入力内容を見直してください。" });
          } else if (final.stop_reason === "max_tokens") {
            send({ type: "error", message: "作業が長くなりすぎたため中断しました。データを分けて実行してください。" });
          } else {
            send({ type: "error", message: "エージェントが結果を提出しませんでした。もう一度実行してください。" });
          }
          return;
        }
        send({ type: "error", message: "作業の回数が上限に達したため中断しました。" });
      } catch (error) {
        // 内部エラーには元データが含まれることがあるため、そのまま記録しない。
        let message = "作業中にエラーが発生しました。時間をおいて再度お試しください。";
        if (error instanceof ConversationError) {
          message = error.message;
        } else if (error instanceof UnsafeCsvError) {
          message = error.message;
        } else if (error instanceof Anthropic.AuthenticationError) {
          message = "APIキーが正しくないようです。ANTHROPIC_API_KEY の設定を確認してください。";
        } else if (error instanceof Anthropic.NotFoundError) {
          message = `モデル「${model.id}」が見つかりません。別のモデルを選んでください。`;
        } else if (error instanceof Anthropic.RateLimitError) {
          // 何も実行されていない再開リクエストだけ、新しい一度限りの券で回答待ちに戻す。
          // 途中まで実行済みの場合は、同じ処理を二重に行わないよう再開しない。
          if (resumeCheckpoint && !receivedEvents && !abort.signal.aborted) {
            try {
              const previous = resumeCheckpoint.messages[resumeCheckpoint.messages.length - 1];
              const asks: Anthropic.Beta.BetaToolUseBlockParam[] = [];
              if (Array.isArray(previous.content)) {
                for (const block of previous.content) {
                  if (block.type === "tool_use" && block.name === "ask_user") asks.push(block);
                }
              }
              const questions = asks.map((b) => {
                const input = b.input as { question: string; options?: string[] };
                return { id: b.id, question: input.question, options: input.options ?? [] };
              });
              const continuation = currentTask.mode === "general" ? await sealConversation(resumeCheckpoint, session.id, "question") : undefined;
              const ticket = continuation?.ticket ?? await sealRunState(resumeCheckpoint, session.id);
              send({ type: "status", message: "利用が集中しています。添付と質問を保持しました。少し待ってから同じ回答を送信してください。" });
              send({ type: "question", questions, state: ticket, ...(continuation ? { continuation } : {}) });
              waitingForAnswer = true;
              return;
            } catch { /* 期限切れや保存先の停止時は、最初から実行するよう案内する。 */ }
          }
          message = "利用が集中したため作業を終了しました。少し待ってから最初から実行してください。";
        } else if (error instanceof Anthropic.BadRequestError) {
          message = "リクエストが受け付けられませんでした。入力内容やモデルの設定を確認してください。";
        }
        send({ type: "error", message });
      } finally {
        // 質問・追加依頼の受付中だけ元資料を残し、会話終了時に削除する。
        // 画面を閉じても元添付は2時間で期限切れになる。生成物・コンテナ内コピーは別の保持条件。
        if (!waitingForAnswer) {
          if (state.conversationId) await invalidateConversation(state.conversationId, session.id).catch(() => {});
          await Promise.allSettled([...new Set([...state.fileIds, ...(state.outputFileIds ?? [])])].map((id) => client.files.delete(id, {}, { signal: AbortSignal.timeout(5000) })));
        }
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", onAbort);
        try { await release(); } catch { /* 保存先が停止しても、実行枠は6分で失効する。 */ }
        if (!streamCancelled) controller.close();
      }
    },
    cancel() { streamCancelled = true; abort.abort(); },
  });

  return new Response(body, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
