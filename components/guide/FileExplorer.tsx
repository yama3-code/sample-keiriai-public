"use client";

import { useState } from "react";
import { fileAnchor, guideFileGroups, guideFilePlace, guideFiles } from "@/lib/guide/files";
import styles from "./Guide.module.css";

export default function FileExplorer() {
  const [query, setQuery] = useState("");
  const [groupName, setGroupName] = useState("");
  const search = query.trim().normalize("NFKC").toLocaleLowerCase("ja");
  const groups = guideFileGroups.filter((group) => !groupName || groupName === group.name).map((group) => ({ ...group, files: group.files.filter(([path, role]) => `${path} ${role} ${group.place}`.normalize("NFKC").toLocaleLowerCase("ja").includes(search)) })).filter((group) => group.files.length);
  const count = groups.reduce((total, group) => total + group.files.length, 0);
  return <section className={styles.explorer} aria-labelledby="file-catalog">
    <div className={styles.sectionHeading}><h2 id="file-catalog">ファイル案内</h2><span>{guideFiles.length}ファイル</span></div>
    <div className={styles.filterRow}>
      <label>名前・役割で検索<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例：検算、.css、uploads" /></label>
      <label>分類で絞り込む<select value={groupName} onChange={(e) => setGroupName(e.target.value)}><option value="">すべての分類</option>{guideFileGroups.map((group) => <option key={group.name}>{group.name}</option>)}</select></label>
    </div>
    <p className={styles.resultCount} role="status">{count} / {guideFiles.length}ファイルを表示</p>
    {!count ? <div className={styles.emptyState}><p>一致するファイルがありません。</p><button type="button" className={styles.secondaryButton} onClick={() => { setQuery(""); setGroupName(""); }}>すべて表示する</button></div> : null}
    {groups.map((group) => <section key={group.name} className={styles.fileGroup}>
      <h3>{group.name}</h3><p>{group.explanation}</p>
      <dl>{group.files.map(([path, role]) => <div key={path} id={fileAnchor(path)} className={styles.fileRow}><dt><code>{path}</code><span>{guideFilePlace(path, group.place)}</span></dt><dd>{role}</dd></div>)}</dl>
    </section>)}
    <aside className={styles.note}><strong>Gitに含めないもの</strong><p>.env.localは秘密の環境設定、.local/は手元の保存記録です。node_modules/は導入済み部品、.next/は自動生成物、next-env.d.tsはNext.jsが作る型の案内です。これらの内容はこのサイトへ読み込みません。</p></aside>
  </section>;
}
