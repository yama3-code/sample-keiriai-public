"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { guideChapters, type GuideSlug } from "@/lib/guide/navigation";
import styles from "./Guide.module.css";

const STORAGE_KEY = "keiri-guide-progress-v1";
const CHANGE_EVENT = "keiri-guide-progress-changed";
type ProgressSnapshot = { completed: GuideSlug[]; ready: boolean; persistent: boolean };
const serverSnapshot: ProgressSnapshot = { completed: [], ready: false, persistent: true };
let snapshot = serverSnapshot;
let cachedRaw: string | null | undefined;
let sessionOnly = false;

function parseCompleted(raw: string | null): GuideSlug[] {
  if (!raw || raw.length > 5000) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("version" in parsed) || parsed.version !== 1 || !("completed" in parsed) || !Array.isArray(parsed.completed)) return [];
    const completed = parsed.completed;
    // 存在する章だけを目次の順番で取り出し、重複や未知の章名を記録へ混ぜない。
    return guideChapters.filter((chapter) => completed.includes(chapter.slug)).map((chapter) => chapter.slug);
  } catch { return []; }
}

function getSnapshot(): ProgressSnapshot {
  if (sessionOnly) return snapshot;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!snapshot.ready || raw !== cachedRaw) {
      cachedRaw = raw;
      snapshot = { completed: parseCompleted(raw), ready: true, persistent: true };
    }
  } catch {
    sessionOnly = true;
    snapshot = { ...snapshot, ready: true, persistent: false };
  }
  return snapshot;
}

function getServerSnapshot() { return serverSnapshot; }

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

function useGuideProgress() { return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot); }

function toggleChapter(slug: GuideSlug) {
  const current = getSnapshot();
  const completed = current.completed.includes(slug) ? current.completed.filter((item) => item !== slug) : guideChapters.filter((chapter) => current.completed.includes(chapter.slug) || chapter.slug === slug).map((chapter) => chapter.slug);
  snapshot = { completed, ready: true, persistent: !sessionOnly };
  if (!sessionOnly) {
    try {
      const raw = JSON.stringify({ version: 1, completed });
      window.localStorage.setItem(STORAGE_KEY, raw);
      cachedRaw = raw;
    } catch {
      sessionOnly = true;
      snapshot = { ...snapshot, persistent: false };
    }
  }
  // 同じページ内の目次・表紙・ボタンにも、保存した結果をすぐ反映する。
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ChapterStatus({ slug, compact = false }: { slug: GuideSlug; compact?: boolean }) {
  const { completed } = useGuideProgress();
  if (!completed.includes(slug)) return null;
  return <span className={compact ? styles.chapterDoneCompact : styles.chapterDone}><span aria-hidden="true">✓</span>{compact ? <span className="visually-hidden">理解済み</span> : " 理解済み"}</span>;
}

export function GuideProgressSummary({ compact = false }: { compact?: boolean }) {
  const { completed, ready, persistent } = useGuideProgress();
  const next = guideChapters.find((chapter) => !completed.includes(chapter.slug));
  return <section className={compact ? styles.progressCompact : styles.progressOverview} aria-label="学習の進み具合">
    <div className={styles.progressHeading}><strong>学習の進み具合</strong><span>{ready ? `${completed.length} / ${guideChapters.length}章を理解` : "読み込み中…"}</span></div>
    <progress max={guideChapters.length} value={completed.length} aria-label={`${guideChapters.length}章中${completed.length}章を理解済み`} />
    {!compact ? <div className={styles.progressResume}><p>{!ready ? "このブラウザの記録を確認しています。" : !next ? "全12章を理解済みにしました。気になる章は、いつでも読み返せます。" : completed.length ? `次は「${next.short}」から読み進められます。` : "各章の最後で「理解できた」を押すと、ここに記録されます。"}</p>{ready && next ? <Link href={`/guide/${next.slug}`}>{completed.length ? "続きから読む →" : "学習を始める →"}</Link> : null}</div> : null}
    <p className={styles.progressStorage}>{persistent ? "このブラウザだけに保存。別の端末には共有しません。" : "ブラウザに保存できないため、今開いている間だけ記録します。"}</p>
  </section>;
}

export function ChapterCompletion({ slug }: { slug: GuideSlug }) {
  const { completed, ready, persistent } = useGuideProgress();
  const done = completed.includes(slug);
  return <section className={styles.completion} aria-labelledby="chapter-completion">
    <div><span className={styles.smallLabel}>学びをひと区切り</span><h2 id="chapter-completion">この章、理解できましたか？</h2><p>自分の言葉で説明できそうなら、ボタンを押して記録しましょう。後から取り消して、もう一度学ぶこともできます。</p></div>
    <button type="button" className={done ? styles.completedButton : styles.primaryButton} aria-pressed={done} disabled={!ready} onClick={() => toggleChapter(slug)}>{done ? "✓ 理解済み（取り消す）" : "理解できた"}</button>
    <p className={styles.completionStatus} role="status">{!ready ? "記録を読み込んでいます。" : done ? `この章を理解済みにしました。${completed.length === guideChapters.length ? "全12章を達成しました。" : `あと${guideChapters.length - completed.length}章です。`}` : "まだ途中でも大丈夫です。分からない部分を読み返してみてください。"}</p>
    <p className={styles.progressStorage}>{persistent ? "記録はこのブラウザに保存され、再読み込みしても残ります。ブラウザのデータを消すと記録も消えます。" : "このブラウザでは保存できないため、ページを閉じたり再読み込みしたりすると記録は消えます。"}</p>
  </section>;
}
