"use client";

import { useEffect, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SafeMarkdown from "./SafeMarkdown";
import ConfigurationHistory from "./ConfigurationHistory";
import type { ConfigurationUpdate, EditableConfiguration, TaskTextValues } from "@/lib/configuration-types";
import styles from "./SettingsEditor.module.css";
import agentStyles from "./Agent.module.css";

const fields = [
  { key: "name", label: "業務名", max: 100, rows: 1, hint: "業務一覧に表示する名前です。" },
  { key: "summary", label: "業務の説明", max: 1000, rows: 3, hint: "どのような作業をするかを、短く説明します。" },
  { key: "instructionPlaceholder", label: "補足指示の入力例", max: 2000, rows: 2, hint: "業務画面の補足指示欄に、入力例として表示します。" },
  { key: "manual", label: "作業マニュアル", max: 50_000, rows: 24, hint: "手順・計算方法・端数の扱い・要確認にする条件を書きます。「手順1」などの見出しを残すと読みやすくなります。" },
] as const;

export default function SettingsEditor() {
  const router = useRouter();
  const [original, setOriginal] = useState<EditableConfiguration | null>(null);
  const [draft, setDraft] = useState<EditableConfiguration | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/settings", { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "編集内容を読み込めませんでした。");
        if (abort.signal.aborted) return;
        const configuration = data as EditableConfiguration;
        setOriginal(configuration); setDraft(configuration);
        setSelectedId((id) => id || configuration.tasks[0]?.id || "rules");
      })
      .catch((reason: Error) => { if (!abort.signal.aborted) setError(reason.message || "通信に失敗しました。"); });
    return () => abort.abort();
  }, [reloadKey]);

  const task = draft?.tasks.find((item) => item.id === selectedId);
  const beforeTask = original?.tasks.find((item) => item.id === selectedId);
  const rulesSelected = selectedId === "rules";
  const changes = !draft || !original ? [] : rulesSelected
    ? (draft.expenseRules === original.expenseRules ? [] : [{ label: "経費精算規程", before: original.expenseRules, after: draft.expenseRules }])
    : fields.filter((field) => task?.[field.key] !== beforeTask?.[field.key])
      .map((field) => ({ label: field.label, before: beforeTask?.[field.key] ?? "", after: task?.[field.key] ?? "" }));
  const dirty = changes.length > 0;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function selectDocument(id: string) {
    if (saving || id === selectedId) return;
    if (dirty && !window.confirm("保存していない変更があります。変更を取り消して別の項目を開きますか？")) return;
    setDraft(original); setSelectedId(id); setReview(false); setError(""); setNotice("");
  }
  function updateTask(key: keyof TaskTextValues, value: string) {
    setDraft((current) => current ? { ...current, tasks: current.tasks.map((item) => item.id === selectedId ? { ...item, [key]: value } : item) } : current);
    setNotice(""); setError("");
  }
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (saving || (dirty && !window.confirm("保存していない変更を取り消して、業務画面に戻りますか？"))) return;
    // 保存した文言を確実に反映するため、移動後に最新の内容を読み込む。
    router.push("/");
    router.refresh();
  }
  function reload() {
    if (dirty && !window.confirm("入力中の変更を取り消して、最新の内容を読み込みますか？")) return;
    setOriginal(null); setDraft(null); setReview(false); setError(""); setNotice(""); setReloadKey((key) => key + 1);
  }
  async function save() {
    if (!draft || !original || !review || !dirty || saving) return;
    let update: ConfigurationUpdate;
    if (rulesSelected) update = { version: original.version, target: "rules", expenseRules: draft.expenseRules };
    else {
      if (!task) return;
      const { name, summary, manual, instructionPlaceholder } = task;
      update = { version: original.version, target: "task", taskId: task.id, values: { name, summary, manual, instructionPlaceholder } };
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存できませんでした。");
      setOriginal(data); setDraft(data); setReview(false);
      setNotice("保存しました。次に業務を実行するときから、新しい内容を使います。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "通信に失敗しました。時間をおいて再度お試しください。"); }
    finally { setSaving(false); }
  }

  const documentTitle = rulesSelected ? "経費精算規程" : beforeTask?.name || "業務内容";
  return (
    <div className={styles.app}>
      <a href="#editor" className="skip-link">編集内容へ移動</a>
      <header className={agentStyles.header}>
        <Link href="/" prefetch={false} onClick={leave} className={agentStyles.brand} aria-label="経理AIエージェント 業務に戻る">
          <span className={agentStyles.mark} aria-hidden="true">経</span>
          <span><span className={agentStyles.brandSub}>株式会社サンプル商事</span><span className={agentStyles.brandName}>経理AIエージェント</span></span>
        </Link>
        <Link href="/" prefetch={false} onClick={leave} className={styles.backLink}>業務に戻る</Link>
      </header>
      <div className={styles.layout}>
        <aside className={styles.side} aria-label="編集する項目">
          <p className={styles.sectionLabel}>編集する</p>
          <h2 className={styles.groupLabel}>業務ごとの説明・手順</h2>
          <ul className={styles.documents}>
            {original?.tasks.map((item) => <li key={item.id}><button type="button" disabled={saving} onClick={() => selectDocument(item.id)} className={selectedId === item.id ? styles.selected : styles.document} aria-current={selectedId === item.id ? "page" : undefined}>{item.name}</button></li>)}
          </ul>
          <h2 className={styles.groupLabel}>共通データ</h2>
          <Link href="/masters" className={styles.document} onClick={(event) => { if (saving || (dirty && !window.confirm("保存していない変更を取り消してマスタ設定に進みますか？"))) event.preventDefault(); }}>マスタ設定（追加・差し替え・削除）</Link>
          <h2 className={styles.groupLabel}>共通ルール</h2>
          <button type="button" disabled={saving || !original || !original.masters.some((m) => m.kind === "rules")} onClick={() => selectDocument("rules")} className={rulesSelected ? styles.selected : styles.document} aria-current={rulesSelected ? "page" : undefined}>経費精算規程</button>
          <p className={styles.sideNote}>ここで保存した内容は、すべての利用者に共通で反映されます。</p>
        </aside>

        <main id="editor" className={styles.main}>
          <p className={styles.eyebrow}>編集する</p>
          <h1 className={styles.title}>ルール・業務内容の編集</h1>
          <p className={styles.lead}>必要な文言や手順を変更し、内容を確認してから保存してください。保存するまでは、現在の業務には反映されません。</p>
          {notice && <p className={styles.success} role="status">{notice}</p>}
          {error && <div className={styles.error} role="alert"><p>{error}</p><button type="button" onClick={reload} disabled={saving} className={styles.secondary}>最新の内容を読み込む</button></div>}
          {!draft || !original ? <p role="status">{error ? "内容を読み込めませんでした。上のボタンから再度お試しください。" : "編集内容を読み込んでいます…"}</p> : (
            <section className={styles.panel} aria-labelledby="document-title">
              <div className={styles.panelHead}><h2 id="document-title">{documentTitle}</h2><span className={dirty ? styles.unsaved : styles.saved}>{dirty ? "未保存の変更あり" : "保存済み"}</span></div>
              {review ? (
                <div>
                  <h3 className={styles.reviewTitle}>変更内容の確認</h3>
                  <p className={styles.hint}>この内容で保存すると、次回の業務から使われます。</p>
                  {changes.map((change) => <section key={change.label} className={styles.change}>
                    <h4>{change.label}</h4>
                    <div className={styles.comparison}>
                      <div><p>変更前</p><pre>{change.before || "（空欄）"}</pre></div>
                      <div><p>変更後</p><pre>{change.after || "（空欄）"}</pre></div>
                    </div>
                  </section>)}
                  <div className={styles.actions}>
                    <button type="button" className={styles.primary} onClick={save} disabled={saving}>{saving ? "保存しています…" : "この内容で保存する"}</button>
                    <button type="button" className={styles.secondary} onClick={() => setReview(false)} disabled={saving}>編集に戻る</button>
                  </div>
                </div>
              ) : (
                <form onSubmit={(event) => { event.preventDefault(); if (dirty) setReview(true); }}>
                  {rulesSelected ? <div className={styles.field}>
                    <label htmlFor="expense-rules">経費精算規程</label>
                    <p id="rules-hint" className={styles.hint}>すべての業務で参照するルールです。条文の見出しや番号を残して編集してください。</p>
                    <textarea id="expense-rules" rows={26} maxLength={50_000} required disabled={saving} aria-describedby="rules-hint" value={draft.expenseRules} onChange={(event) => { setDraft({ ...draft, expenseRules: event.target.value }); setNotice(""); setError(""); }} />
                  </div> : task && fields.map((field) => <div key={field.key} className={styles.field}>
                    <label htmlFor={`edit-${field.key}`}>{field.label}</label>
                    <p id={`hint-${field.key}`} className={styles.hint}>{field.hint}</p>
                    <textarea id={`edit-${field.key}`} rows={field.rows} maxLength={field.max} disabled={saving} required={field.key === "name" || field.key === "manual"} aria-describedby={`hint-${field.key}`} value={task[field.key]} onChange={(event) => updateTask(field.key, event.target.value)} />
                  </div>)}
                  <details className={styles.preview}>
                    <summary>手順・ルールを読みやすい表示で確認</summary>
                    <div className={agentStyles.markdown}><SafeMarkdown>{rulesSelected ? draft.expenseRules : task?.manual || ""}</SafeMarkdown></div>
                  </details>
                  <div className={styles.actions}>
                    <button type="submit" className={styles.primary} disabled={!dirty}>変更内容を確認する</button>
                    <button type="button" className={styles.secondary} disabled={!dirty} onClick={() => { if (window.confirm("保存していない変更を取り消しますか？")) { setDraft(original); setError(""); setNotice(""); } }}>変更を取り消す</button>
                  </div>
                </form>
              )}
            </section>
          )}
          {original && <ConfigurationHistory configuration={original} disabled={dirty || saving} canRestore onRestoringChange={setSaving} onRestored={(configuration) => { setOriginal(configuration); setDraft(configuration); setReview(false); setError(""); setNotice("選んだ内容を復元しました。次回の業務から使います。"); router.refresh(); }} />}
        </main>
      </div>
    </div>
  );
}
