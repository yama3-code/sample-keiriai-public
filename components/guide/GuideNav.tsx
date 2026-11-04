"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { guideChapters, guideGroups } from "@/lib/guide/navigation";
import { ChapterStatus, GuideProgressSummary } from "./GuideProgress";
import styles from "./Guide.module.css";

export type GuideSearchItem = { slug: string; title: string; text: string };

function excerpt(text: string, query: string) {
  const normalized = text.normalize("NFKC");
  const start = Math.max(0, normalized.toLocaleLowerCase("ja").indexOf(query) - 24);
  return `${normalized.slice(start, start + 95)}…`;
}

function Contents({ index }: { index: GuideSearchItem[] }) {
  const pathname = usePathname();
  const id = useId();
  const [query, setQuery] = useState("");
  const normalized = query.trim().normalize("NFKC").toLocaleLowerCase("ja");
  const found = normalized ? index.filter((item) => `${item.title} ${item.text}`.normalize("NFKC").toLocaleLowerCase("ja").includes(normalized)) : [];
  return <>
    <GuideProgressSummary compact />
    <label className={styles.searchLabel} htmlFor={id}>ガイド内を検索</label>
    <input id={id} type="search" placeholder="例：検算、会話、Redis" value={query} onChange={(e) => setQuery(e.target.value)} className={styles.search} />
    {normalized ? <div className={styles.searchResults}>
      <p role="status">{found.length}章が見つかりました</p>
      {found.map((item) => <Link key={item.slug} href={`/guide/${item.slug}`}><strong>{item.title}</strong><span>{excerpt(item.text, normalized)}</span></Link>)}
      {!found.length ? <p>別の言葉でもお試しください。ファイル名は「ファイルの役割」で検索できます。</p> : null}
      <button type="button" onClick={() => setQuery("")} className={styles.textButton}>検索を解除</button>
    </div> : <nav aria-label="学習ガイドの章">
      <Link href="/guide" className={styles.coverLink} aria-current={pathname === "/guide" ? "page" : undefined}>ガイドの表紙</Link>
      <Link href="/guide/quick" className={styles.quickLink} aria-current={pathname === "/guide/quick" ? "page" : undefined}>3分で分かる版<small>はじめての方へ</small></Link>
      {guideGroups.map((group) => <div key={group} className={styles.navGroup}>
        <p>{group}</p>
        {guideChapters.map((chapter, i) => chapter.group === group ? <Link href={`/guide/${chapter.slug}`} key={chapter.slug} className={styles.chapterLink} aria-current={pathname === `/guide/${chapter.slug}` ? "page" : undefined}><span>{String(i + 1).padStart(2, "0")}</span>{chapter.short}<ChapterStatus slug={chapter.slug} compact /></Link> : null)}
      </div>)}
    </nav>}
    <div className={styles.navNote}><span className={styles.smallLabel}>このガイドについて</span><p>2026年11月3日の実装をもとに作成。閲覧と練習操作はAIを呼びません。</p><button type="button" className={styles.textButton} onClick={() => window.print()}>このページを印刷する</button></div>
  </>;
}

export default function GuideNav({ index }: { index: GuideSearchItem[] }) {
  const pathname = usePathname();
  return <aside className={styles.sidebar}>
    <div className={styles.desktopNav}><Contents index={index} /></div>
    <details className={styles.mobileNav} key={pathname}><summary>目次と検索を開く</summary><div><Contents index={index} /></div></details>
  </aside>;
}
