"use client";

import { useEffect, useRef, useState } from "react";
import { CONFIGURATION_HISTORY_LIMIT, type ConfigurationHistoryDetail, type ConfigurationHistorySummary, type EditableConfiguration } from "@/lib/configuration-types";
import styles from "./SettingsEditor.module.css";

const savedDate = (date: string | null) => date ? new Date(date).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "最初の保存前";

type Props = {
  configuration: EditableConfiguration;
  disabled: boolean;
  canRestore: boolean;
  onRestored: (configuration: EditableConfiguration) => void;
  onRestoringChange: (restoring: boolean) => void;
};

export default function ConfigurationHistory(props: Props) {
  return <HistoryContents key={props.configuration.version} {...props} />;
}

function HistoryContents({ configuration, disabled, canRestore, onRestored, onRestoringChange }: Props) {
  const [detail, setDetail] = useState<ConfigurationHistoryDetail | null>(null);
  const [loading, setLoading] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { requestRef.current?.abort(); requestRef.current = null; };
  }, []);

  function exportConfiguration() {
    if (disabled || restoring) return;
    setError("");
    try {
      const exportedAt = new Date().toISOString();
      // 保存済みの手順とマスタだけを控えにし、履歴や通信の情報は含めない。
      const backup = { format: "keiri-configuration-backup-v1", exportedAt, updatedAt: configuration.updatedAt, tasks: configuration.tasks, masters: configuration.masters };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `AI経理エージェント_設定の控え_${exportedAt.replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError("設定を書き出せませんでした。もう一度お試しください。"); }
  }

  function historyItem(entry: ConfigurationHistorySummary, recovery = false) {
    const date = entry.id === "initial" ? "アプリに同梱された内容" : savedDate(entry.savedAt);
    return <li key={entry.id}>
      <div><p>{entry.description}{entry.isCurrent && <span className={styles.saved}>現在の内容</span>}</p>
        {entry.id === "initial" ? <span className={styles.historyDate}>{date}</span> : <time dateTime={entry.savedAt ?? undefined}>{date}</time>}
      </div>
      <button type="button" className={styles.secondary} disabled={disabled || restoring || !!loading} onClick={() => void openHistory(entry.id)}>
        {loading === entry.id ? "読み込んでいます…" : recovery ? entry.id === "initial" ? "初期値を確認" : "保護した控えを確認" : "内容を確認"}
      </button>
    </li>;
  }

  async function openHistory(id: string) {
    if (disabled || restoring) return;
    requestRef.current?.abort();
    const abort = new AbortController(); requestRef.current = abort;
    setLoading(id); setError(""); setDetail(null); setConfirmed(false);
    try {
      const response = await fetch(`/api/settings/recovery?history=${encodeURIComponent(id)}`, { cache: "no-store", signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "履歴を読み込めませんでした。");
      if (abort.signal.aborted || requestRef.current !== abort) return;
      if (data.version !== configuration.version) throw new Error("ほかの画面で内容が更新されています。最新の内容を読み込んでから履歴を確認してください。");
      setDetail(data);
    } catch (reason) { if (!abort.signal.aborted && requestRef.current === abort) setError(reason instanceof Error ? reason.message : "履歴を読み込めませんでした。"); }
    finally { if (requestRef.current === abort) { setLoading(""); requestRef.current = null; } }
  }

  async function restore() {
    if (!detail || disabled || restoring || !canRestore || !confirmed || !detail.changes.length || detail.version !== configuration.version) return;
    setRestoring(true); onRestoringChange(true); setError("");
    try {
      const response = await fetch("/api/settings/recovery", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: detail.version, target: "restore", historyId: detail.entry.id }) });
      const data = await response.json();
      if (!response.ok) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const wait = response.status === 429 && Number.isFinite(retryAfter) && retryAfter > 0 ? `（あと約${Math.ceil(retryAfter / 60)}分）` : "";
        throw new Error(`${data.error || "復元できませんでした。"}${wait}`);
      }
      setDetail(null); setConfirmed(false); onRestored(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "復元できませんでした。"); }
    finally { setRestoring(false); onRestoringChange(false); }
  }

  return <section className={`${styles.panel} ${styles.history}`} aria-labelledby="configuration-history-title">
    <h2 id="configuration-history-title">変更履歴と復元</h2>
    <p className={styles.hint}>最終更新：{savedDate(configuration.updatedAt)}。手順・規程・マスタをまとめて戻せます。履歴や控えはすべての利用者が確認できます。</p>
    {disabled && <p className={styles.hint}>入力中の変更を保存または取り消すと、履歴の確認や書き出しができます。</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.recovery}>
      <h3>保護された復元先</h3>
      <p className={styles.hint}>保護した控えとアプリの初期値は、通常の履歴が押し出されても残ります。初期値に戻すと、削除したマスタや変更前の手順も戻るため、先に違いを確認してください。</p>
      {!configuration.recovery?.some((entry) => entry.id === "baseline") && <p className={styles.hint}>保護した控えは、次の保存時に作られます。</p>}
      <ul className={styles.historyList}>{configuration.recovery?.map((entry) => historyItem(entry, true))}</ul>
      <p className={styles.hint}>初期値・保護した控えへの復旧は、通常保存と別枠です。同じ接続元で1分5回・1時間10回、全体で1分10回・1時間20回まで受け付けます。</p>
    </div>
    <div className={styles.historySection}>
      <h3>最近の変更履歴</h3>
      <p className={styles.hint}>直近{CONFIGURATION_HISTORY_LIMIT}版を容量の上限まで残します。古い版は順に消えます。容量が足りない場合は最近の履歴を減らし、現在の設定と保護した控えを優先します。保護した控えは、この件数に含みません。</p>
      <p className={styles.hint}>最近の履歴からの復元は、通常保存と合わせて同じ接続元で1時間30回・全体で60回までです。復元を繰り返しても履歴の件数は増えません。</p>
      {!configuration.history?.length ? <p className={styles.hint}>最近の履歴はまだないか、容量に合わせて整理されています。</p> : <ul className={styles.historyList}>{configuration.history.map((entry) => historyItem(entry))}</ul>}
    </div>
    <div className={styles.historySection}>
      <h3>手元にも控えを残す</h3>
      <p className={styles.hint}>大きな変更の前や定期的に、保存済みの設定を書き出してください。JSON形式のファイルは手動で入力し直すための控えです。この画面からの取り込みには対応していません。</p>
      <button type="button" className={styles.secondary} disabled={disabled || restoring} onClick={exportConfiguration}>現在の設定を書き出す</button>
    </div>
    {detail && <div className={styles.historyReview}>
      <h3>現在の内容と、復元後の内容の違い</h3>
      <p className={styles.hint}>{detail.entry.id === "initial" ? "アプリの初期値" : savedDate(detail.entry.savedAt)} ／ {detail.entry.description}</p>
      {!detail.changes.length ? <p>現在と同じ内容です。</p> : <>
        <p className={styles.hint}>復元すると、業務の手順・規程・マスタをまとめて選んだ内容に戻します。削除済みのマスタが戻る場合もあるため、下の変更を確認してください。復元では新しい履歴を追加せず、最終更新日時を更新します。</p>
        {detail.changes.map((change, index) => <section className={styles.change} key={index}>
          <h4>{change.label}</h4><div className={styles.comparison}>
            <div><p>現在の内容</p><pre>{change.before || "（空欄）"}</pre></div>
            <div><p>復元後の内容</p><pre>{change.after || "（空欄）"}</pre></div>
          </div>
        </section>)}
        {canRestore ? <>
          <label className={styles.historyConfirm}><input type="checkbox" checked={confirmed} disabled={disabled || restoring} onChange={(event) => setConfirmed(event.target.checked)} />変更内容を確認しました</label>
          <div className={styles.actions}><button type="button" className={styles.primary} disabled={disabled || restoring || !confirmed} onClick={() => void restore()}>{restoring ? "復元しています…" : "この内容で復元する"}</button></div>
        </> : <p className={styles.hint}>復元するときは、この画面の「編集する」を押してください。</p>}
      </>}
      <button type="button" className={styles.secondary} disabled={restoring} onClick={() => { setDetail(null); setConfirmed(false); setError(""); }}>内容の確認を閉じる</button>
    </div>}
  </section>;
}
