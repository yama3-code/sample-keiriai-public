"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { markdownLinkTarget } from "@/lib/markdown-links";
import styles from "./MarkdownLink.module.css";

export default function MarkdownLink({ href, children }: { href?: string; children: ReactNode }) {
  const target = markdownLinkTarget(href);
  if (target.kind === "blocked") return <span className={styles.blocked}>{children}<span className={styles.note}>（{target.reason}）</span></span>;
  if (target.kind === "local") return <a href={target.href} referrerPolicy="no-referrer">{children}</a>;
  // 移動先が変わった場合は部品を作り直し、前のURLへの確認状態を引き継がない。
  return <ExternalLink key={target.href} href={target.href}>{children}</ExternalLink>;
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const [confirming, setConfirming] = useState(false);
  const confirmationId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirming) cancel.current?.focus(); }, [confirming]);

  function close() {
    setConfirming(false);
    trigger.current?.focus();
  }

  return <span className={styles.link} onKeyDown={(event) => {
    if (event.key === "Escape" && confirming) { event.preventDefault(); close(); }
  }}>
    <button type="button" ref={trigger} className={styles.trigger} aria-expanded={confirming} aria-controls={confirming ? confirmationId : undefined} onClick={() => setConfirming(true)}>
      {children}<span className={styles.note}>（外部リンク）</span>
    </button>
    <span className={styles.destination}>移動先：{href}</span>
    {confirming && <span id={confirmationId} className={styles.confirmation} role="group" aria-label="外部サイトへの移動確認">
      <span className={styles.explanation}>URLに資料や会話の内容が含まれていないか確認してください。開くと、URLの内容が移動先へ送信されます。</span>
      <span className={styles.actions}>
        <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={styles.proceed}>確認して外部サイトを開く</a>
        <button type="button" ref={cancel} className={styles.cancel} onClick={close}>開かない</button>
      </span>
    </span>}
  </span>;
}
