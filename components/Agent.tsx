"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import SafeMarkdown from "./SafeMarkdown";
import type { Question, RunEvent } from "@/app/api/run/route";
import { EFFORTS, type Effort, type ModelOption } from "@/lib/models";
import type { TaskDefinition } from "@/lib/tasks";
import { GENERAL_INSTRUCTION_LIMIT, MAX_TASK_FILES, MAX_TASK_FILE_BYTES } from "@/lib/upload-types";
import { parseCsv } from "@/lib/csv";
import { readRunStream } from "@/lib/run-stream";
import type { Continuation } from "@/lib/conversation";
import FollowupForm from "./FollowupForm";
import GeneralFiles from "./GeneralFiles";
import styles from "./Agent.module.css";

type Props = {
  tasks: TaskDefinition[];
  sharedData: { name: string; detail: string }[];
  models: ModelOption[];
  defaultModel: string;
  defaultEffort: Effort;
  efforts: (typeof EFFORTS)[number][];
  usageNotice: string;
  configurationUpdatedAt: string | null;
  configurationVersion: string;
};

type ResultEvent = Extract<RunEvent, { type: "result" }>;
type QuestionEvent = Extract<RunEvent, { type: "question" }>;
// 進み具合の欄に表示するもの（質問と回答の記録を含む）
type ProgressEvent =
  | Exclude<RunEvent, ResultEvent | QuestionEvent>
  | { type: "qa"; question: string; answer: string };

const yen = (n: number) => n.toLocaleString("ja-JP");

function downloadText(text: string, filename: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function CsvPreview({ text, maxRows = 12 }: { text: string; maxRows?: number }) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return <p className={styles.muted}>データがありません</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, maxRows).map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows && (
        <p className={styles.muted}>ほか {rows.length - maxRows} 行（全 {rows.length} 行）</p>
      )}
    </div>
  );
}

export default function Agent({ tasks, sharedData, models, efforts, defaultModel, defaultEffort, usageNotice, configurationVersion, configurationUpdatedAt }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(tasks[0]?.id ?? "");
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [fileError, setFileError] = useState("");
  const [generalFiles, setGeneralFiles] = useState<File[]>([]);
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [effort, setEffort] = useState<Effort>(defaultEffort);
  const [allowQuestions, setAllowQuestions] = useState(true);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<QuestionEvent | null>(null); // 回答待ちの質問
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<ResultEvent | null>(null);
  const [history, setHistory] = useState<{ id: string; request: string; result?: ResultEvent; notes: string[] }[]>([]);
  const [continuation, setContinuation] = useState<Continuation | null>(null);
  const conversationRef = useRef<Continuation | null>(null);
  const activeTurn = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); abortRef.current = null; }, []);
  const resultRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const task = tasks.find((t) => t.id === selectedId);
  const isGeneral = task?.mode === "general";
  const busy = running || pending !== null; // 実行中または回答待ち
  const formLocked = busy || (isGeneral && history.length > 0);
  const selectedModel = models.find((m) => m.id === model);
  const selectedEffort = efforts.find((e) => e.id === effort);

  function discardConversation() {
    const current = conversationRef.current;
    if (current) void fetch("/api/conversation/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.id }), keepalive: true }).catch(() => {});
    conversationRef.current = null; setContinuation(null); setHistory([]); activeTurn.current = "";
  }
  function newRequest() {
    if (running) return;
    discardConversation(); setPending(null); setResult(null); setProgress([]); setInstructions(""); setGeneralFiles([]);
    mainRef.current?.scrollTo({ top: 0 });
  }
  function beginTurn(request: string) {
    const id = crypto.randomUUID(); activeTurn.current = id;
    setHistory((items) => [...items, { id, request, notes: [] }]);
  }
  function selectTask(id: string) {
    if (busy) return;
    discardConversation();
    setSelectedId(id);
    setFiles({});
    setFileError("");
    setGeneralFiles([]);
    setInstructions("");
    setProgress([]);
    setResult(null);
  }

  // ロゴを押したら、最初の画面（先頭の業務・結果なし）に戻る
  function goHome(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (busy && !window.confirm("作業中です。中止してトップに戻りますか？")) return;
    abortRef.current?.abort();
    abortRef.current = null;
    discardConversation();
    setPending(null);
    setRunning(false);
    setSelectedId(tasks[0]?.id ?? "");
    setFiles({});
    setFileError("");
    setGeneralFiles([]);
    setInstructions("");
    setProgress([]);
    setResult(null);
    mainRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }

  function handleFile(inputId: string, e: ChangeEvent<HTMLInputElement>) {
    const additions = Array.from(e.target.files ?? []);
    e.target.value = "";
    const selected = [...(files[inputId] ?? [])];
    for (const file of additions) {
      if (!file.name.toLowerCase().endsWith(".csv") || !file.size || file.size > MAX_TASK_FILE_BYTES) {
        setFileError(`「${file.name}」は空のファイルか対応外です。1MBまでのCSVを選んでください。`); return;
      }
      if (!selected.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) selected.push(file);
    }
    const total = Object.entries(files).reduce((sum, [id, list]) => sum + (id === inputId ? 0 : list.length), selected.length);
    if (total > MAX_TASK_FILES) { setFileError("ファイルは業務全体で合計10個までです。選択済みのファイルを減らしてください。"); return; }
    setFiles((prev) => ({ ...prev, [inputId]: selected }));
    setFileError("");
  }

  // サーバーに送信し、1行ずつ届く進み具合（JSON）を読み取る
  async function send(form: FormData, attachments: { file: File; inputId?: string }[] = []) {
    if (abortRef.current) return;
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const isCurrent = () => abortRef.current === controller;
    const turnId = activeTurn.current;
    const addProgress = (event: ProgressEvent) => {
      if (!isCurrent()) return;
      setProgress((prev) => [...prev, event]);
      const note = "message" in event ? event.message : event.type === "qa" ? `${event.question} → ${event.answer}` : "";
      if (note) setHistory((items) => items.map((item) => item.id === turnId ? { ...item, notes: [...item.notes, note] } : item));
    };

    try {
      let batchId = "";
      for (let i = 0; i < attachments.length; i++) {
        addProgress({ type: "status", message: `添付ファイルを送信しています（${i + 1}/${attachments.length}）` });
        const upload = new FormData();
        upload.set("file", attachments[i].file);
        if (attachments[i].inputId) {
          upload.set("taskId", String(form.get("taskId")));
          upload.set("inputId", attachments[i].inputId!);
        }
        if (batchId) upload.set("batchId", batchId);
        const response = await fetch("/api/uploads", { method: "POST", body: upload, signal: controller.signal });
        const data = await response.json();
        if (!response.ok || typeof data.batchId !== "string") {
          addProgress({ type: "error", message: data.error ?? "ファイルを送信できませんでした。再度お試しください。" });
          return;
        }
        batchId = data.batchId;
      }
      if (batchId) form.set("uploadBatch", batchId);
      const res = await fetch("/api/run", { method: "POST", body: form, signal: controller.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        addProgress({ type: "error", message: data.error ?? "実行できませんでした" });
        return;
      }

      await readRunStream(res.body, (event) => {
        if (!isCurrent()) return;
        if (event.type === "result") {
          if (isGeneral) {
            setHistory((items) => items.map((item) => item.id === turnId ? { ...item, result: event } : item));
            setContinuation(event.continuation ?? null);
            if (event.continuation) conversationRef.current = event.continuation;
          }
          setResult(event);
          setTimeout(() => { if (!controller.signal.aborted) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50);
        } else if (event.type === "question") {
          if (event.continuation) { conversationRef.current = event.continuation; setContinuation(null); }
          setPending(event);
          setTimeout(() => { if (!controller.signal.aborted) questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50);
        } else addProgress(event);
      }, controller.signal);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        addProgress({ type: "error", message: "作業を中止しました" });
      } else {
        addProgress({ type: "error", message: "通信が途切れました。時間をおいて再度お試しください。" });
      }
    } finally {
      if (isCurrent()) {
        setRunning(false);
        abortRef.current = null;
      }
    }
  }

  function run() {
    if (!task || busy || abortRef.current || (isGeneral && (!instructions.trim() || history.length > 0))) return;
    if (isGeneral) beginTurn(instructions);
    setProgress([]);
    setResult(null);
    const form = new FormData();
    form.append("taskId", task.id);
    form.append("configurationVersion", configurationVersion);
    form.append("instructions", instructions);
    form.append("model", model);
    form.append("effort", effort);
    form.append("allowQuestions", String(allowQuestions));
    const attachments = isGeneral
      ? generalFiles.map((file) => ({ file }))
      : task.inputs.flatMap((input) => (files[input.id] ?? []).map((file) => ({ file, inputId: input.id })));
    if (!isGeneral) form.set("inputIds", JSON.stringify(task.inputs.filter((input) => files[input.id]?.length).map((input) => input.id)));
    send(form, attachments);
  }

  function followup(text: string) {
    if (!continuation || busy || abortRef.current) return;
    beginTurn(text); setProgress([]); setResult(null);
    const form = new FormData(); form.set("followup", continuation.ticket); form.set("instructions", text);
    setContinuation(null);
    void send(form);
  }

  // 質問に回答して、作業を再開する
  function answer(answers: Record<string, string>) {
    if (!pending || abortRef.current) return;
    setProgress((prev) => [
      ...prev,
      ...pending.questions.map((q) => ({ type: "qa" as const, question: q.question, answer: answers[q.id] || "（回答なし）" })),
    ]);
    if (isGeneral) setHistory((items) => items.map((item) => item.id === activeTurn.current ? { ...item, notes: [...item.notes, ...pending.questions.map((q) => `${q.question} → ${answers[q.id] || "（回答なし）"}`)] } : item));
    const form = new FormData();
    form.append("resume", pending.state);
    form.append("answers", JSON.stringify(answers));
    setPending(null);
    send(form);
  }

  function cancelQuestion() {
    if (isGeneral) {
      const current = conversationRef.current;
      if (current) void fetch("/api/conversation/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: current.id }) }).catch(() => {});
      setContinuation(null);
    }
    setPending(null);
    setProgress((prev) => [...prev, { type: "error", message: "作業を中止しました" }]);
  }

  return (
    <div className={styles.app}>
      <a href="#main" className="skip-link">
        本文へ移動
      </a>

      <header className={styles.header}>
        <Link href="/" className={styles.brand} onClick={goHome} aria-label="経理AIエージェント トップに戻る">
          <span className={styles.mark} aria-hidden="true">
            経
          </span>
          <span>
            <span className={styles.brandSub}>株式会社サンプル商事</span>
            <span className={styles.brandName}>経理AIエージェント</span>
          </span>
        </Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button type="button" onClick={() => router.push("/masters")} disabled={busy} className={styles.editMenu}>マスタ設定</button>
        <button type="button" onClick={() => router.push("/edit")} disabled={busy} className={styles.editMenu}>
          編集する
        </button>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.side} aria-label="業務一覧">
          <section>
            <h2 className={styles.sideLabel}>業務を選ぶ</h2>
            <ul className={styles.taskList}>
              {tasks.map((t, i) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`${styles.taskButton} ${t.id === selectedId ? styles.taskActive : ""}`}
                    onClick={() => selectTask(t.id)}
                    disabled={busy && t.id !== selectedId}
                    aria-current={t.id === selectedId ? "true" : undefined}
                  >
                    <span className={styles.taskNo}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={styles.taskName}>{t.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.sideShared}>
            <h2 className={styles.sideLabel}>共通データ</h2>
            <ul className={styles.sharedList}>
              {sharedData.map((d) => (
                <li key={d.name}>
                  <span>{d.name}</span>
                  <span className={styles.sharedDetail}>{d.detail}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className={styles.disclaimer}>
            架空の会社のダミーデータです。作成された仕訳は、必ず担当者が確認してから使ってください。
          </p>
        </aside>

        <main id="main" className={styles.main} ref={mainRef}>
          {task ? (
            <div className={styles.content}>
              <section className={styles.intro}>
                <p className={styles.eyebrow}>業務</p>
                <h1 className={styles.title}>{task.name}</h1>
                <p className={styles.summary}>{task.summary}</p>
                <p className={styles.fieldNote}>ルール・マスタの最終更新：{configurationUpdatedAt ? new Date(configurationUpdatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "初期設定"}</p>
                <details className={styles.manual}>
                  <summary>作業マニュアルを読む</summary>
                  <div className={styles.markdown}>
                    <SafeMarkdown>{task.manual}</SafeMarkdown>
                  </div>
                </details>
              </section>

              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>
                  <span className={styles.panelNo}>1</span>入力データ
                </h2>
                <p className={styles.fieldNote}>資料はClaudeへ送信されます。元のアップロードには2時間の期限を設定しますが、作業用環境内のコピーはAnthropic側で最大30日保持されます。作業中に作られたファイルは削除を試みますが、削除失敗時の自動消去期限は保証できません。架空データで確認してください。</p>
                {isGeneral ? <GeneralFiles files={generalFiles} onChange={setGeneralFiles} disabled={formLocked} /> : <>
                <p className={styles.panelLead}>
                  種類ごとに複数のCSVを選べます。業務全体で合計10個まで、1ファイル1MBまでです。未選択の種類にはサンプルデータを使います。
                </p>
                <p className={styles.fileCount} aria-live="polite">{Object.values(files).reduce((sum, list) => sum + list.length, 0)} / {MAX_TASK_FILES} 個を選択中</p>
                {fileError && <p className={styles.fileError} role="alert">{fileError}</p>}
                <ul className={styles.inputs}>
                  {task.inputs.map((input) => {
                    const selected = files[input.id] ?? [];
                    return (
                      <li key={input.id} className={styles.input}>
                        <div className={styles.inputHead}>
                          <div>
                            <p className={styles.inputLabel}>{input.label}</p>
                            <p className={styles.inputDesc}>{input.description}</p>
                          </div>
                          <span className={selected.length ? styles.badgeFile : styles.badgeSample}>
                            {selected.length ? `${selected.length}個のファイル` : "サンプルデータ"}
                          </span>
                        </div>
                        <div className={styles.inputActions}>
                          <label className={styles.secondaryButton}>
                            ファイルを追加する
                            <input
                              aria-label={`${input.label}のCSVファイル`}
                              type="file"
                              multiple
                              accept=".csv,text/csv"
                              className="visually-hidden"
                              onChange={(e) => handleFile(input.id, e)}
                              disabled={formLocked}
                            />
                          </label>
                          {selected.length > 0 && (
                            <button
                              type="button"
                              className={styles.textButton}
                              onClick={() => { setFiles((prev) => ({ ...prev, [input.id]: [] })); setFileError(""); }}
                              disabled={formLocked}
                            >
                              サンプルに戻す
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.textButton}
                            onClick={() => downloadText("﻿" + task.samples[input.id], input.file)}
                          >
                            サンプルをダウンロード
                          </button>
                        </div>
                        {selected.length > 0 && <ul className={styles.attachmentList}>
                          {selected.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}>
                            <span className={styles.attachmentName}>{file.name}<span className={styles.fieldNote}>{Math.max(1, Math.ceil(file.size / 1024))} KB</span></span>
                            <button type="button" className={styles.textButton} aria-label={`${input.label}の${file.name}を外す`} disabled={formLocked}
                              onClick={() => { setFiles((prev) => ({ ...prev, [input.id]: (prev[input.id] ?? []).filter((_, i) => i !== index) })); setFileError(""); }}>外す</button>
                          </li>)}
                        </ul>}
                        <details className={styles.preview}>
                          <summary>サンプルデータの中身を見る</summary>
                          <CsvPreview text={task.samples[input.id]} />
                        </details>
                      </li>
                    );
                  })}
                </ul>
                </>}
              </section>

              <section className={styles.panel}>
                <h2 className={styles.panelTitle}>
                  <span className={styles.panelNo}>2</span>実行の設定
                </h2>
                {usageNotice && <p className={styles.fieldNote}>{usageNotice}</p>}

                <div className={styles.settings}>
                  <div className={styles.field}>
                    <label htmlFor="model" className={styles.fieldLabel}>
                      AIモデル
                    </label>
                    <select
                      id="model"
                      className={styles.select}
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={formLocked}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                          {m.id === defaultModel ? "（標準）" : ""}
                        </option>
                      ))}
                    </select>
                    {selectedModel && <p className={styles.fieldNote}>{selectedModel.note}</p>}
                  </div>

                  <fieldset className={styles.field}>
                    <legend className={styles.fieldLabel}>エフォート（考える深さ）</legend>
                    <div className={styles.segmented}>
                      {efforts.map((e) => (
                        <label key={e.id} className={e.id === effort ? styles.segmentActive : styles.segment}>
                          <input
                            type="radio"
                            name="effort"
                            value={e.id}
                            checked={e.id === effort}
                            onChange={() => setEffort(e.id)}
                            disabled={formLocked}
                            className="visually-hidden"
                          />
                          {e.label}
                        </label>
                      ))}
                    </div>
                    {selectedEffort && <p className={styles.fieldNote}>{selectedEffort.note}</p>}
                  </fieldset>
                </div>

                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={allowQuestions}
                    onChange={(e) => setAllowQuestions(e.target.checked)}
                    disabled={formLocked}
                  />
                  <span>
                    作業の途中で、判断に迷ったら質問してもらう
                    <span className={styles.fieldNote}>オフにすると、迷った事項はすべて「要確認事項」に回します</span>
                  </span>
                </label>

                <div className={styles.field}>
                  <label htmlFor="instructions" className={styles.fieldLabel}>
                    {isGeneral ? "依頼内容（必須）" : "補足指示（任意）"}
                  </label>
                  <textarea
                    id="instructions"
                    className={styles.textarea}
                    rows={isGeneral ? 5 : 2}
                    maxLength={isGeneral ? GENERAL_INSTRUCTION_LIMIT : 2000}
                    required={isGeneral}
                    placeholder={task.instructionPlaceholder}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    disabled={formLocked}
                  />
                  {isGeneral && <p className={styles.fieldNote}>集計・照合・チェック・仕訳案など、してほしい作業と、ほしい結果を書いてください。最大10,000文字です。</p>}
                </div>

                <div className={styles.runRow}>
                  <button type="button" className={styles.primaryButton} onClick={run} disabled={formLocked || (isGeneral && !instructions.trim())}>
                    {running ? "実行しています…" : pending ? "回答を待っています" : isGeneral ? "AI経理エージェントに依頼する" : "この業務を実行する"}
                  </button>
                  {running && (
                    <button type="button" className={styles.textButton} onClick={() => abortRef.current?.abort()}>
                      中止する
                    </button>
                  )}
                  <span className={styles.muted}>作業には1〜3分ほどかかります</span>
                </div>
              </section>

              {isGeneral && history.length > 0 && <div className={styles.panel}><button type="button" className={styles.secondaryButton} disabled={running} onClick={newRequest}>新しい依頼</button><p className={styles.fieldNote}>これまでの会話を終了して、別の資料・依頼で始めます。</p></div>}
              {progress.length > 0 && (
                <section className={styles.panel} aria-live="polite">
                  <h2 className={styles.panelTitle}>
                    <span className={styles.panelNo}>3</span>作業の進み具合
                  </h2>
                  <ol className={styles.progress}>
                    {progress.map((p, i) => {
                      const isLast = i === progress.length - 1;
                      if (p.type === "status")
                        return (
                          <li key={i} className={styles.pStatus}>
                            {p.message}
                            {isLast && running && <span className={styles.dots} aria-hidden="true" />}
                          </li>
                        );
                      if (p.type === "note")
                        return (
                          <li key={i} className={styles.pNote}>
                            {p.text}
                          </li>
                        );
                      if (p.type === "code")
                        return (
                          <li key={i} className={styles.pCode}>
                            <span className={styles.pCodeLabel}>計算</span>
                            {p.title}
                            {isLast && running && <span className={styles.dots} aria-hidden="true" />}
                          </li>
                        );
                      if (p.type === "qa")
                        return (
                          <li key={i} className={styles.pQa}>
                            <span className={styles.pQaLabel}>質問</span>
                            {p.question}
                            <span className={styles.pQaAnswer}>回答：{p.answer}</span>
                          </li>
                        );
                      if (p.type === "code_result")
                        return (
                          <li key={i} className={p.ok ? styles.pResult : styles.pResultNg}>
                            <details>
                              <summary>{p.ok ? "実行結果を見る" : "エラーが出ました（エージェントが修正します）"}</summary>
                              <pre>{p.output || "（出力なし）"}</pre>
                            </details>
                          </li>
                        );
                      return (
                        <li key={i} className={styles.pError} role="alert">
                          {p.message}
                        </li>
                      );
                    })}
                  </ol>
                  {pending && (
                    <div ref={questionRef}>
                      {isGeneral && <p className={styles.fieldNote}>回答待ちを含め、この依頼は開始から5分までです。期限を過ぎた場合は「新しい依頼」から始めてください。</p>}
                      <QuestionCard questions={pending.questions} onAnswer={answer} onCancel={cancelQuestion} disabled={running} />
                    </div>
                  )}
                </section>
              )}

              {isGeneral ? <div ref={resultRef} className={styles.conversationHistory}>
                {history.map((turn, index) => <article key={turn.id} aria-label={`第${index + 1}回の依頼と結果`}>
                  <div className={styles.panel}><h2 className={styles.subTitle}>第{index + 1}回の依頼</h2><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{turn.request}</p>
                    {turn.notes.length > 0 && <details><summary>この回の進み具合・案内</summary><ul>{turn.notes.map((note, i) => <li key={i}>{note}</li>)}</ul></details>}
                  </div>
                  {turn.result && <><Result result={turn.result} taskName={`${task.name}_第${index + 1}回`} />{turn.result.continuationNotice && <p role="status" className={styles.panel}>{turn.result.continuationNotice}</p>}</>}
                </article>)}
                {continuation && <FollowupForm key={continuation.ticket} expiresAt={continuation.expiresAt} disabled={busy} onSend={followup} />}
                {history.length > 0 && !continuation && !busy && <p className={styles.fieldNote}>続きの受付は終了しています。必要な結果を保存し、「新しい依頼」から始めてください。</p>}
              </div> : result && <div ref={resultRef}><Result result={result} taskName={task.name} /></div>}
            </div>
          ) : (
            <p className={styles.muted}>業務が登録されていません。</p>
          )}
        </main>
      </div>
    </div>
  );
}

function Result({ result: { result, checks, csv, report, tables }, taskName }: { result: ResultEvent; taskName: string }) {
  // ファイル名に今日の日付を付ける（押したときに計算する）
  const filename = () => `${taskName}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.csv`;
  const allOk = checks.every((c) => c.ok);
  const showJournal = report === undefined || result.entries.length > 0;
  const debitTotal = result.entries.reduce((s, e) => s + e.debit_amount, 0);
  const creditTotal = result.entries.reduce((s, e) => s + e.credit_amount, 0);

  return (
    <section className={`${styles.panel} ${styles.resultPanel}`}>
      <h2 className={styles.panelTitle}>
        <span className={styles.panelNo}>4</span>作業結果
      </h2>
      <p className={styles.resultSummary}>{result.summary}</p>

      {report !== undefined && <div className={styles.report}>
        <div className={styles.entriesHead}>
          <h3 className={styles.subTitle}>依頼への回答</h3>
          <button type="button" className={styles.secondaryButton} onClick={() => downloadText(report, `${taskName}_報告書.txt`, "text/plain;charset=utf-8")}>
            報告書を保存
          </button>
        </div>
        <div className={styles.markdown}><SafeMarkdown>{report}</SafeMarkdown></div>
        <p className={styles.fieldNote}>保存する報告書は、画像やHTMLを自動表示しないテキスト形式です。保存先のソフトでリンクを開く場合も、移動先を確認してください。</p>
        {tables?.map((table, index) => <div className={styles.outputTable} key={index}>
          <div className={styles.entriesHead}>
            <h3 className={styles.subTitle}>{table.name}<span className={styles.count}>{table.rows.length}行</span></h3>
            {table.csv !== null && <button type="button" className={styles.secondaryButton} onClick={() => downloadText(table.csv!, `${taskName}_表${index + 1}.csv`)}>表をCSVで保存</button>}
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>{table.columns.map((column, i) => <th key={i} scope="col">{column}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {table.csv === null && <p className={styles.fileError}>数式として扱われる文字が含まれるため、この表のCSV保存は停止しました。内容は画面で確認してください。</p>}
        </div>)}
        <p className={styles.fieldNote}>回答・集計表は担当者が確認してから使ってください。仕訳がある場合は、下の「プログラムによる検算」も確認できます。</p>
      </div>}

      <div className={showJournal ? styles.resultGrid : undefined}>
        {showJournal && <div className={styles.checks}>
          <h3 className={styles.subTitle}>
            プログラムによる検算
            <span className={allOk ? styles.okBadge : styles.ngBadge}>{allOk ? "問題なし" : "要修正"}</span>
          </h3>
          <ul>
            {checks.map((c) => (
              <li key={c.label} className={c.ok ? styles.checkOk : styles.checkNg}>
                <span className={styles.checkMark}>{c.ok ? "OK" : "NG"}</span>
                <span>
                  {c.label}
                  {c.detail && <span className={styles.checkDetail}>{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>}

        <div className={styles.issues}>
          <h3 className={styles.subTitle}>
            要確認事項<span className={styles.count}>{result.issues.length}件</span>
          </h3>
          {result.issues.length === 0 ? (
            <p className={styles.muted}>ありません</p>
          ) : (
            <ul>
              {result.issues.map((issue, i) => (
                <li key={i}>
                  <span className={issue.level === "要確認" ? styles.levelHigh : styles.levelLow}>{issue.level}</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {showJournal && <><div className={styles.entriesHead}>
        <h3 className={styles.subTitle}>
          作成した仕訳<span className={styles.count}>{result.entries.length}行</span>
        </h3>
        {result.entries.length > 0 && (
          <button type="button" className={styles.primaryButton} disabled={!allOk} onClick={() => downloadText(csv, filename())}>
            仕訳CSVをダウンロード
          </button>
        )}
      </div>
      {result.entries.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.entries}`}>
            <thead>
              <tr>
                <th>伝票番号</th>
                <th>日付</th>
                <th>借方科目</th>
                <th>借方部門</th>
                <th className={styles.num}>借方金額</th>
                <th>貸方科目</th>
                <th>貸方部門</th>
                <th className={styles.num}>貸方金額</th>
                <th>摘要</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((e, i) => (
                <tr key={i}>
                  <td>{e.voucher_no}</td>
                  <td>{e.date}</td>
                  <td>
                    <span className={styles.code}>{e.debit_code}</span>
                    {e.debit_account}
                  </td>
                  <td>{e.debit_department}</td>
                  <td className={styles.num}>{yen(e.debit_amount)}</td>
                  <td>
                    <span className={styles.code}>{e.credit_code}</span>
                    {e.credit_account}
                  </td>
                  <td>{e.credit_department}</td>
                  <td className={styles.num}>{yen(e.credit_amount)}</td>
                  <td className={styles.memo}>{e.memo}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>合計</td>
                <td className={styles.num}>{yen(debitTotal)}</td>
                <td colSpan={2} />
                <td className={styles.num}>{yen(creditTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className={styles.muted}>作成した仕訳はありません。</p>
      )}</>}

      <details className={styles.steps} open>
        <summary>手順ごとの作業ログ</summary>
        <ol>
          {result.steps.map((s, i) => (
            <li key={i}>
              <p className={styles.stepTitle}>{s.title}</p>
              <p className={styles.stepResult}>{s.result}</p>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

// エージェントからの質問に答えるカード
function QuestionCard({
  questions,
  onAnswer,
  onCancel,
  disabled,
}: {
  questions: Question[];
  onAnswer: (answers: Record<string, string>) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});

  const answerOf = (id: string) =>
    [choices[id], texts[id]?.trim()].filter(Boolean).join(" ／ 補足：");
  const ready = questions.every((q) => answerOf(q.id) !== "");

  return (
    <div className={styles.question} role="alert">
      <p className={styles.questionLabel}>エージェントから確認したいことがあります</p>
      {questions.map((q, n) => (
        <div key={q.id} className={styles.questionItem}>
          <p className={styles.questionText}>
            {questions.length > 1 && `${n + 1}. `}
            {q.question}
          </p>
          {q.options.length > 0 && (
            <div className={styles.options}>
              {q.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={choices[q.id] === o ? styles.optionActive : styles.option}
                  aria-pressed={choices[q.id] === o}
                  onClick={() => setChoices((prev) => ({ ...prev, [q.id]: prev[q.id] === o ? "" : o }))}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
          <label className="visually-hidden" htmlFor={`answer-${q.id}`}>
            回答を入力
          </label>
          <textarea
            id={`answer-${q.id}`}
            className={styles.textarea}
            rows={2}
            maxLength={1000}
            placeholder={q.options.length > 0 ? "選択肢以外の回答や補足があれば入力" : "回答を入力"}
            value={texts[q.id] ?? ""}
            onChange={(e) => setTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
          />
        </div>
      ))}
      <div className={styles.runRow}>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={disabled || !ready}
          onClick={() => onAnswer(Object.fromEntries(questions.map((q) => [q.id, answerOf(q.id)])))}
        >
          回答して作業を続ける
        </button>
        <button type="button" className={styles.textButton} onClick={onCancel}>
          作業を中止する
        </button>
      </div>
    </div>
  );
}
