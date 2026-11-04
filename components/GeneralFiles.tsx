"use client";

import { useState, type ChangeEvent } from "react";
import { GENERAL_ACCEPT, GENERAL_FILE_TYPES, MAX_GENERAL_FILE_BYTES, MAX_GENERAL_FILES, fileExtension } from "@/lib/upload-types";
import styles from "./Agent.module.css";

export default function GeneralFiles({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled: boolean }) {
  const [error, setError] = useState("");
  function select(event: ChangeEvent<HTMLInputElement>) {
    const additions = Array.from(event.target.files ?? []);
    event.target.value = "";
    const combined = [...files];
    for (const file of additions) {
      if (!Object.hasOwn(GENERAL_FILE_TYPES, fileExtension(file.name))) {
        setError(`「${file.name}」は対応していない形式です。CSV・Excel・PDF・画像を選んでください。`); return;
      }
      if (!file.size || file.size > MAX_GENERAL_FILE_BYTES) {
        setError(`「${file.name}」は空のファイルか、3MBを超えています。`); return;
      }
      if (!combined.some((current) => current.name === file.name && current.size === file.size && current.lastModified === file.lastModified)) combined.push(file);
    }
    if (combined.length > MAX_GENERAL_FILES) { setError("添付できるファイルは15個までです。選択済みのファイルを減らしてから追加してください。"); return; }
    setError("");
    onChange(combined);
  }
  return <>
    <p className={styles.panelLead}>CSV・Excel（xlsx・xls）・PDF・画像（PNG・JPEG・WebP）を、最大15個まで添付できます。1ファイル3MBまでです。</p>
    <div className={styles.inputActions}>
      <label className={styles.secondaryButton}>
        ファイルを追加する
        <input aria-label="AI経理エージェントの添付ファイル" type="file" multiple accept={GENERAL_ACCEPT} onChange={select} disabled={disabled} className="visually-hidden" />
      </label>
      <span className={styles.fileCount} aria-live="polite">{files.length} / {MAX_GENERAL_FILES} 個を選択中</span>
      {files.length > 0 && <button type="button" className={styles.textButton} disabled={disabled} onClick={() => { onChange([]); setError(""); }}>すべて外す</button>}
    </div>
    {error && <p className={styles.fileError} role="alert">{error}</p>}
    {files.length > 0 && <ul className={styles.attachmentList}>
      {files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}>
        <span className={styles.attachmentName}>{file.name}<span className={styles.fieldNote}>{Math.max(1, Math.ceil(file.size / 1024)).toLocaleString("ja-JP")} KB</span></span>
        <button type="button" className={styles.textButton} aria-label={`${file.name}を外す`} disabled={disabled} onClick={() => { onChange(files.filter((_, i) => i !== index)); setError(""); }}>外す</button>
      </li>)}
    </ul>}
    <p className={styles.fieldNote}>添付なしでも依頼できます。サンプルデータは使いません。ファイルは「AI経理エージェントに依頼する」を押したときに送信します。</p>
  </>;
}
