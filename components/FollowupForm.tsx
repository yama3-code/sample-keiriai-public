"use client";

import { useEffect, useState } from "react";
import styles from "./Agent.module.css";

export default function FollowupForm({ expiresAt, disabled, onSend }: { expiresAt: number; disabled: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const update = () => setExpired(Date.now() >= expiresAt);
    update(); const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return <section className={styles.panel}>
    <h2 className={styles.subTitle}>この結果への追加依頼</h2>
    <p className={styles.fieldNote}>元資料とこれまでの会話を引き継ぎます。再読み込み・画面を閉じると続きは失われます。継続期限：{new Date(expiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（最長2時間）。依頼は初回を含め6回までです。</p>
    <label htmlFor="followup-request">別の視点で確認したいことや、修正してほしい内容を入力してください</label>
    <textarea id="followup-request" className={styles.textarea} rows={4} maxLength={10000} value={text} disabled={disabled || expired} onChange={(e) => setText(e.target.value)} placeholder="例：交通費だけに絞って、部門別の内訳も追加してください" />
    {expired ? <p role="status">継続期限を過ぎました。「新しい依頼」から資料を送ってください。</p> : <button type="button" className={styles.primaryButton} disabled={disabled || !text.trim()} onClick={() => { onSend(text.trim()); setText(""); }}>追加依頼を実行する</button>}
    <p className={styles.fieldNote}>追加の資料は添付できません。1回の実行は質問の回答待ちを含め5分までです。</p>
  </section>;
}
