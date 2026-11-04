"use client";

import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EditableConfiguration } from "@/lib/configuration-types";
import type { ExcelMaster } from "@/lib/master-excel";
import { MASTER_KINDS, type MasterData } from "@/lib/master-types";
import styles from "./SettingsEditor.module.css";
import agentStyles from "./Agent.module.css";
import ConfigurationHistory from "./ConfigurationHistory";

export default function MasterSettings() {
  const router = useRouter();
  const [original, setOriginal] = useState<EditableConfiguration | null>(null);
  const [draft, setDraft] = useState<MasterData[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState(false);
  const [excel, setExcel] = useState<{ source: ExcelMaster; targetId: string } | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const fileRead = useRef(0);
  useEffect(() => () => { fileRead.current++; }, []);
  const dirty = !!original && JSON.stringify(original.masters) !== JSON.stringify(draft);
  const selected = draft.find((m) => m.id === selectedId);

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/settings", { cache: "no-store", signal: abort.signal }).then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "共通データを読み込めませんでした");
      if (abort.signal.aborted) return;
      setOriginal(data); setDraft(data.masters); setSelectedId(data.masters[0]?.id ?? "");
    }).catch((e) => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [reloadKey]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(values: Partial<MasterData>) {
    setDraft((items) => items.map((m) => m.id === selectedId ? { ...m, ...values } : m));
    setNotice(""); setError("");
  }
  async function replace(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || !selected) return;
    const id = selected.id; const attempt = ++fileRead.current;
    setReading(true); setExcel(null);
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        if (file.size > 2 * 1024 * 1024 || !file.size) throw new Error("Excelは2MBまでです。");
        const { readExcelMaster } = await import("@/lib/master-excel");
        const source = readExcelMaster(await file.arrayBuffer(), file.name);
        if (attempt !== fileRead.current) return;
        setExcel({ source, targetId: id }); setSheetName(source.sheetNames[0]);
        setNotice("シートを選び「このシートを取り込む」を押してください。保存前に内容を確認できます。"); setError("");
        return;
      }
      if (!/\.(csv|txt|md)$/i.test(file.name) || file.size > 200 * 1024 || !file.size) throw new Error("200KBまでのCSV・TXT・MDを選んでください");
      const bytes = await file.arrayBuffer(); let content;
      try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { content = new TextDecoder("shift_jis").decode(bytes); }
      content = content.replace(/^\uFEFF/, "");
      if (!content.trim() || content.length > 50_000 || content.includes("\0")) throw new Error("本文は空欄にできません。50,000文字以内のテキストを選んでください");
      if (attempt !== fileRead.current) return;
      setDraft((items) => items.map((m) => m.id === id ? { ...m, filename: file.name, content } : m));
      setNotice("ファイルを読み込みました。保存すると反映されます。"); setError("");
    } catch (e) { if (attempt === fileRead.current) setError(e instanceof Error ? e.message : "読み込めませんでした"); }
    finally { if (attempt === fileRead.current) setReading(false); }
  }
  async function importSheet() {
    if (!excel || excel.targetId !== selectedId || reading) return;
    const attempt = ++fileRead.current; setReading(true);
    try {
      const { excelMasterSheet } = await import("@/lib/master-excel");
      const values = excelMasterSheet(excel.source, sheetName);
      if (attempt !== fileRead.current) return;
      setDraft((items) => items.map((m) => m.id === excel.targetId ? { ...m, ...values } : m));
      setExcel(null); setNotice(`「${sheetName}」を取り込みました。内容を確認して保存してください。`); setError("");
    } catch (e) { if (attempt === fileRead.current) setError(e instanceof Error ? e.message : "シートを読み込めませんでした"); }
    finally { if (attempt === fileRead.current) setReading(false); }
  }
  function add() {
    if (draft.length >= 20) { setError("共通データは20件までです"); return; }
    fileRead.current++; setReading(false); setExcel(null);
    const master: MasterData = { id: crypto.randomUUID(), name: "新しい共通データ", kind: "reference", filename: "reference.txt", content: "" };
    setDraft((items) => [...items, master]); setSelectedId(master.id); setReview(false); setNotice("");
  }
  function leave(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (saving || (dirty && !window.confirm("保存していない変更を取り消して戻りますか？"))) return;
    router.push("/"); router.refresh();
  }
  async function save() {
    if (!original || !dirty || saving || reading || excel) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: original.version, target: "masters", masters: draft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存できませんでした");
      setOriginal(data); setDraft(data.masters); setReview(false); setEditing(false);
      setNotice("保存しました。次回の業務から、新しい共通データと検算用マスタを使います。");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした"); }
    finally { setSaving(false); }
  }
  const changes = original ? [
    ...draft.filter((m) => !original.masters.some((old) => old.id === m.id)).map((m) => `追加：${m.name}`),
    ...draft.filter((m) => { const old = original.masters.find((o) => o.id === m.id); return old && JSON.stringify(old) !== JSON.stringify(m); }).map((m) => `変更・差し替え：${m.name}`),
    ...original.masters.filter((old) => !draft.some((m) => m.id === old.id)).map((m) => `削除：${m.name}`),
  ] : [];
  return <div className={styles.app}>
    <header className={agentStyles.header}>
      <Link href="/" prefetch={false} onClick={leave} className={styles.backLink}>業務に戻る</Link>
      <span style={{ color: "white", fontWeight: 700 }}>マスタ設定</span>
    </header>
    <div className={styles.layout}>
      <aside className={styles.side} aria-label="共通データ一覧">
        <h2 className={styles.sectionLabel}>共通データ</h2>
        <ul className={styles.documents}>{draft.map((m) => <li key={m.id}><button disabled={saving} className={m.id === selectedId ? styles.selected : styles.document} onClick={() => { fileRead.current++; setReading(false); setExcel(null); setSelectedId(m.id); }}>{m.name}</button></li>)}</ul>
        {editing && <button className={styles.secondary} onClick={add} disabled={saving}>共通データを追加</button>}
        <p className={styles.sideNote}>保存した内容は、すべての業務と利用者に共通で反映されます。CSV・Excel（xlsx・xls）・TXT・MDに対応、最大20件です。</p>
      </aside>
      <main className={styles.main}>
        <h1 className={styles.title}>マスタ設定</h1>
        <p className={styles.lead}>共通データを確認・追加・差し替え・削除できます。変更は保存するまで業務に反映されません。</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {notice && <p role="status" className={styles.success}>{notice}</p>}
        {!original ? <><p>共通データを読み込んでいます…</p>{error && <button className={styles.secondary} onClick={() => { setError(""); setReloadKey((k) => k + 1); }}>再読み込み</button>}</> : <section className={styles.panel}>
          <div className={styles.panelHead}><h2>{selected?.name || "共通データがありません"}</h2>{!editing && <button className={styles.primary} disabled={saving} onClick={() => setEditing(true)}>編集する</button>}{dirty && <span className={styles.unsaved}>未保存の変更あり</span>}</div>
          {review ? <>
            <h3>変更内容の確認</h3><ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
            <p className={styles.hint}>削除したデータはAIの参照と検算に使用しません。必要なマスタがなければ、業務は要確認になる場合があります。</p>
            <div className={styles.actions}><button className={styles.primary} disabled={saving} onClick={save}>{saving ? "保存しています…" : "この内容で保存する"}</button><button className={styles.secondary} disabled={saving} onClick={() => setReview(false)}>編集に戻る</button></div>
          </> : <>
            {selected && (editing ? <>
              <div className={styles.field}><label htmlFor="master-name">データ名</label><textarea id="master-name" rows={1} maxLength={100} disabled={saving} value={selected.name} onChange={(e) => update({ name: e.target.value })} /></div>
              <div className={styles.field}><label htmlFor="master-kind">用途</label><select id="master-kind" value={selected.kind} disabled={reading || saving} onChange={(e) => update({ kind: e.target.value as MasterData["kind"] })}>{Object.entries(MASTER_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><p className={styles.hint}>勘定科目表：科目コード・科目名が必要。部門マスタ：部門コード・部門名・人数が必要。それぞれの用途は1件ずつ登録できます。</p></div>
              <div className={styles.field}><label htmlFor="master-file">ファイルから差し替える</label><input id="master-file" type="file" accept=".csv,.xlsx,.xls,.txt,.md" onChange={replace} disabled={reading || saving} />{reading && <p role="status">ファイルを読み込んでいます…</p>}<p className={styles.hint}>CSV・TXT・MDは200KB、Excel（xlsx・xls）は2MBまで。CSVはUTF-8・Shift_JISに対応。Excelは1シートずつ取り込みます。1行目を列名にし、数式は値に変換してください。保存する本文は50,000文字まで。</p></div>
              {excel && excel.targetId === selectedId && <div className={styles.field}>
                <label htmlFor="excel-sheet">取り込むExcelシート</label>
                <select id="excel-sheet" value={sheetName} disabled={reading} onChange={(e) => setSheetName(e.target.value)}>{excel.source.sheetNames.map((name) => <option key={name} value={name}>{name}</option>)}</select>
                <p className={styles.hint}>ファイル：{excel.source.filename}。選択した1シートをCSVとして取り込みます。元のExcelファイルは保存しません。</p>
                <button type="button" className={styles.secondary} disabled={reading} onClick={importSheet}>このシートを取り込む</button>
                <button type="button" className={styles.secondary} disabled={reading} onClick={() => { setExcel(null); setNotice(""); }}>シート選択を取り消す</button>
              </div>}
              <div className={styles.field}><label htmlFor="master-content">内容（直接編集もできます）</label><textarea id="master-content" rows={18} maxLength={50_000} value={selected.content} disabled={reading || saving} onChange={(e) => update({ content: e.target.value })} /></div>
              <button className={styles.secondary} disabled={saving} onClick={() => { fileRead.current++; setReading(false); setExcel(null); setDraft(draft.filter((m) => m.id !== selected.id)); setSelectedId(draft.find((m) => m.id !== selected.id)?.id ?? ""); }}>このデータを取り除く</button>
            </> : <><p className={styles.hint}>{MASTER_KINDS[selected.kind]} ／ {selected.filename}</p><div className={styles.comparison}><div><pre>{selected.content}</pre></div></div></>)}
            {editing && <div className={styles.actions}><button className={styles.primary} disabled={saving || reading || !!excel || !dirty || draft.some((m) => !m.name.trim() || !m.content.trim())} onClick={() => setReview(true)}>変更内容を確認する</button><button className={styles.secondary} disabled={saving} onClick={() => { if (!dirty || window.confirm("保存していない変更を取り消しますか？")) { fileRead.current++; setReading(false); setExcel(null); setDraft(original.masters); setEditing(false); setError(""); setNotice(""); } }}>キャンセル</button></div>}
          </>}
          {error && original && <div className={styles.actions}><button className={styles.secondary} disabled={saving} onClick={() => { if (!dirty || window.confirm("入力中の変更を取り消し、最新の内容を読み込みますか？")) { fileRead.current++; setReading(false); setExcel(null); setOriginal(null); setEditing(false); setReview(false); setReloadKey((k) => k + 1); setError(""); } }}>最新の内容を読み込む</button></div>}
        </section>}
        {original && <ConfigurationHistory configuration={original} disabled={dirty || saving || reading || !!excel} canRestore={editing} onRestoringChange={setSaving} onRestored={(configuration) => { fileRead.current++; setReading(false); setExcel(null); setOriginal(configuration); setDraft(configuration.masters); setSelectedId(configuration.masters[0]?.id ?? ""); setEditing(false); setReview(false); setError(""); setNotice("選んだ内容を復元しました。次回の業務から使います。"); router.refresh(); }} />}
      </main>
    </div>
  </div>;
}
