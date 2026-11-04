"use client";

import Link from "next/link";
import { useState } from "react";
import { architectureNodes, codeExamples, flowSteps, quizQuestions } from "@/lib/guide/examples";
import { fileAnchor } from "@/lib/guide/files";
import styles from "./Guide.module.css";

export function ArchitectureLab() {
  const [selected, setSelected] = useState(1);
  const node = architectureNodes[selected];
  return <section className={styles.lab} aria-label="部品を選べるシステム配置図">
    <div className={styles.labHeading}><span className={styles.smallLabel}>図1 · 仕事の分担</span><h3>4つの担当と、受け渡す情報</h3><p>部品を選ぶと、入ってくる情報・返す情報・分担する理由が分かります。</p></div>
    <div className={styles.architecture}>
      {architectureNodes.map((item, i) => <div key={item.title} className={i === 3 ? styles.storeNode : styles.flowNode}>
        <button type="button" onClick={() => setSelected(i)} aria-pressed={selected === i} className={styles.architectureButton}><span>{item.place}</span><strong>{item.title}</strong><small>{item.label}</small></button>
        {i < 2 ? <span className={styles.connector} aria-label="依頼と応答をやり取りする">⇄</span> : null}
      </div>)}
    </div>
    <div className={styles.selectedDetail} aria-live="polite"><strong>{node.title}の担当</strong><p>{node.description}</p><dl className={styles.architectureIo}><div><dt>受け取る情報</dt><dd>{node.receives}</dd></div><div><dt>返す情報</dt><dd>{node.returns}</dd></div><div><dt>この分担にする理由</dt><dd>{node.reason}</dd></div></dl><ul className={styles.figureSources}>{node.paths.map((path) => <li key={path}><Link href={`/guide/files#${fileAnchor(path)}`}>{path}</Link></li>)}</ul></div>
    <p className={styles.caption}>矢印は依頼と応答のやり取り。共通の記録へはサーバーから読み書きします。この図は仕事の分担で、実際に動く場所は図5で確認します。</p>
  </section>;
}

const flowModes = ["通常の流れ", "判断材料が足りない", "設定が変更された", "仕訳の検算がNG"];

export function FlowLab() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState(flowModes[0]);
  const maxStep = mode === flowModes[2] ? 2 : 7;
  const current = flowSteps[step];
  let text: string = current.text;
  if (mode === flowModes[1] && step === 4) text = "部門が分からない行がありました。質問を受け付ける設定なら、AIがあなたに質問して答え待ちになります。判断できなければ、その行を要確認事項として保留します。";
  if (mode === flowModes[2] && step === 2) text = "画面で見ていた設定と、保存されている最新の設定の版が違いました。ここで止まります（エラー番号409）。必要な内容を控えて、最新の設定で新しい依頼を始めます。";
  if (mode === flowModes[3] && step === 6) text = "練習用の例：借方10,000円・貸方9,000円という仕訳が提出されました。借方と貸方が合わないので、検算はNGになります。";
  if (mode === flowModes[3] && step === 7) text = "検算NGの結果と理由を確かめます。仕訳CSVの保存ボタンは押せません。元の資料と手順を調べ、必要なら直してもらうよう依頼します。";
  return <section className={styles.lab} aria-labelledby="flow-lab">
    <div className={styles.labHeading}><span className={styles.smallLabel}>操作で追いかける</span><h2 id="flow-lab">1件の依頼の道のり</h2></div>
    <label className={styles.scenarioLabel}>確かめる場面<select value={mode} onChange={(e) => { setMode(e.target.value); setStep(0); }}>{flowModes.map((name) => <option key={name}>{name}</option>)}</select></label>
    <ol className={styles.stepList}>{flowSteps.map((item, i) => <li key={item.title}><button type="button" onClick={() => setStep(i)} disabled={i > maxStep} aria-current={step === i ? "step" : undefined}><span>{i + 1}</span>{item.title}</button></li>)}</ol>
    <div className={styles.flowDetail} aria-live="polite"><span>{step + 1} / 8　{current.actor}</span><h3>{current.title}</h3><p>{text}</p><code>{current.file}</code></div>
    <div className={styles.labActions}><button type="button" className={styles.secondaryButton} onClick={() => setStep((value) => value - 1)} disabled={step === 0}>前へ</button><button type="button" className={styles.primaryButton} onClick={() => setStep((value) => value + 1)} disabled={step === maxStep}>{step === maxStep ? "この場面の最後です" : "次へ進む →"}</button></div>
    <p className={styles.caption}>練習用の例です。本物のAIへのお願い・資料の送信・検算・設定の保存は行いません。</p>
  </section>;
}

export function CodeLab() {
  const [selected, setSelected] = useState(0);
  const [line, setLine] = useState(0);
  const example = codeExamples[selected];
  return <section className={styles.lab} aria-labelledby="code-lab">
    <div className={styles.labHeading}><span className={styles.smallLabel}>日本語と対応させて読む</span><h2 id="code-lab">実コードの短い抜粋</h2></div>
    <div className={styles.exampleButtons} aria-label="解説するコード">{codeExamples.map((item, i) => <button key={item.title} type="button" aria-pressed={selected === i} onClick={() => { setSelected(i); setLine(0); }}>{i + 1}. {item.title}</button>)}</div>
    <p>{example.meaning}</p><Link className={styles.codePath} href={`/guide/files#${fileAnchor(example.path)}`}>{example.path}</Link>
    <p className={styles.caption}>行を選ぶと、下に意味が表示されます。番号は抜粋内の順番です。</p>
    <div className={styles.codeBox} aria-label="行を選べるプログラム">{example.lines.map((item, i) => <button type="button" key={`${selected}-${i}`} aria-pressed={line === i} onClick={() => setLine(i)} className={styles.codeLine}><span>{i + 1}</span><code>{item.code}</code></button>)}</div>
    <div className={styles.lineExplanation} aria-live="polite"><span>{line + 1}行目を日本語にすると</span><p>{example.lines[line].explanation}</p></div>
    <p className={styles.caption}>2026年11月3日時点の実装から抜粋。単体で動かすためのコードではありません。</p>
  </section>;
}

export function QuizLab() {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const allAnswered = quizQuestions.every((_, i) => answers[i] !== undefined);
  const score = quizQuestions.filter((item, i) => item.answer === answers[i]).length;
  return <section className={styles.quiz} aria-labelledby="quiz-title"><h2 id="quiz-title">5問で確かめる</h2>
    {quizQuestions.map((item, i) => <fieldset key={item.question}><legend><span>Q{i + 1}</span>{item.question}</legend>{item.options.map((option, answer) => <label key={option}><input type="radio" name={`question-${i}`} checked={answers[i] === answer} onChange={() => { setAnswers((previous) => ({ ...previous, [i]: answer })); setChecked(false); }} />{option}</label>)}{checked ? <div className={styles.quizExplanation}><strong>{answers[i] === item.answer ? "正解です" : "ここを確認しましょう"}</strong><p>{item.explanation}</p><Link href={`/guide/${item.chapter}`}>関連する章を読む →</Link></div> : null}</fieldset>)}
    <button type="button" className={styles.primaryButton} disabled={!allAnswered} onClick={() => setChecked(true)}>答え合わせをする</button>
    <p role="status">{checked ? `${score} / 5問が正解でした。各問の理由を読み、自分の言葉でも説明してみてください。` : `${Object.keys(answers).length} / 5問に回答しました。すべて選ぶと答え合わせができます。`}</p>
  </section>;
}
