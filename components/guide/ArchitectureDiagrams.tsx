import Link from "next/link";
import { fileAnchor } from "@/lib/guide/files";
import styles from "./Guide.module.css";

function FigureSources({ paths }: { paths: string[] }) {
  return <ul className={styles.figureSources} aria-label="図の根拠ファイル">{paths.map((path) => <li key={path}><Link href={`/guide/files#${fileAnchor(path)}`}>{path}</Link></li>)}</ul>;
}

// 実処理を呼ばず、実装に基づいた情報の受け渡しを静的に説明する。
export function RequestArchitecture() {
  const exchanges = [
    { from: "ブラウザ", to: "サーバー", title: "元資料を1個ずつ送る", payload: "/api/uploads", detail: "実行ボタンを押した後に送信。拡張子・形式の目印・容量・個数などを検査します。" },
    { from: "サーバー", to: "Anthropic", title: "資料をアップロードする", payload: "Files API → 添付券を画面へ返す", detail: "送信済み資料のID・所有者・期限を共通の記録に置き、画面には添付券を返します。" },
    { from: "ブラウザ", to: "サーバー", title: "作業の依頼を出す", payload: "/api/run", detail: "依頼文・業務ID・モデル・設定の版・添付券を渡します。" },
    { from: "サーバー", to: "共通の記録", title: "基準と受付条件をそろえる", payload: "保存済みマスタ・手順・枠・券", detail: "所有者と期限、設定の版、実行数と回数を確認し、受け付けた券を消費します。" },
    { from: "サーバー", to: "Claude", title: "仕事の材料と道具を渡す", payload: "基本指示 ＋ マニュアル ＋ マスタ ＋ 依頼・資料", detail: "コード実行・担当者への質問・結果提出を使えるようにして作業を依頼します。" },
    { from: "Claude", to: "サーバー", title: "結果を決めた形式で提出する", payload: "submit_result", detail: "報告書・表・仕訳案・ログ・要確認事項を受け取り、形式と仕訳を確認します。" },
    { from: "サーバー", to: "ブラウザ", title: "検算を添えて結果を返す", payload: "報告書・表・検算結果・要確認事項", detail: "画面で確認し、必要な成果物を保存します。進み具合も通信中に少しずつ届きます。" },
  ];
  return <figure className={styles.architectureFigure} aria-labelledby="request-architecture">
    <figcaption><span>図2 · 自由な依頼の情報の流れ</span><h3 id="request-architecture">資料から結果まで、7つの受け渡し</h3><p>添付があり、質問を挟まず結果まで進んだ場合。矢印は情報を渡す向きです。</p></figcaption>
    <ol className={styles.exchangeList}>{exchanges.map((item, i) => <li key={item.title}><span className={styles.exchangeNumber}>{String(i + 1).padStart(2, "0")}</span><div className={styles.exchangeRoute}><span>{item.from}</span><span aria-hidden="true">→</span><span>{item.to}</span></div><div className={styles.exchangeBody}><strong>{item.title}</strong><code>{item.payload}</code><p>{item.detail}</p></div></li>)}</ol>
    <p className={styles.figureFootnote}>Claudeの作業には複数の往復が含まれる場合があります。質問待ちの受け渡しは図4で説明します。</p>
    <FigureSources paths={["components/Agent.tsx", "app/api/uploads/route.ts", "app/api/run/route.ts", "lib/uploads.ts"]} />
  </figure>;
}

export function MasterArchitecture() {
  return <figure className={styles.architectureFigure} aria-labelledby="master-architecture">
    <figcaption><span>図3 · 基準をそろえる</span><h3 id="master-architecture">ひとつのマスタから、2つの使い方へ</h3></figcaption>
    <div className={styles.masterOrigin}><small>loadConfiguration()で、その実行の設定を読む</small><strong>同じ保存済みマスタ</strong><code>configuration.masters</code></div>
    <div className={styles.masterBranches}>
      <div><span className={styles.branchArrow} aria-hidden="true">↓</span><small>作業のために使う</small><h4>AI向けの参照資料</h4><code>masterPrompt()</code><p>科目・部門・規程などを文章に整え、マニュアルとともにClaudeへ渡す。</p><span className={styles.branchOutput}>Claudeが仕訳案を提出 ↓</span></div>
      <div><span className={styles.branchArrow} aria-hidden="true">↓</span><small>照合のために使う</small><h4>検算用の一覧</h4><code>masterChecks()</code><p>同じマスタから、科目コードと名前・部門名の一覧を取り出す。</p><span className={styles.branchOutput}>照合する基準になる ↓</span></div>
    </div>
    <div className={styles.masterCheck}><strong>アプリが仕訳を独立検算する</strong><code>checkEntries(result.entries, masterChecks(configuration.masters))</code><p>AIの仕訳案を、同じ実行で読んだ基準と照合します。</p></div>
    <p className={styles.figureFootnote}>同じ基準を使っていても、マスタ自体の正しさや元資料の処理漏れまで保証するものではありません。</p>
    <FigureSources paths={["lib/configuration.ts", "lib/masters.ts", "lib/journal.ts", "app/api/run/route.ts"]} />
  </figure>;
}

export function ConversationArchitecture() {
  return <figure className={styles.architectureFigure} aria-labelledby="conversation-architecture">
    <figcaption><span>図4 · 自由な依頼の質問と再開</span><h3 id="conversation-architecture">通信を区切り、券で続きをつなぐ</h3></figcaption>
    <ol className={styles.conversationStages}>
      <li><span>01 · 作業中</span><h4>Claudeが確認を求める</h4><code>ask_user</code><p>サーバーが質問と継続券を返し、この通信を終える。同時実行枠も解放する。</p></li>
      <li><span>02 · 回答待ち</span><h4>あなたが画面で回答する</h4><p>ブラウザに券を預ける。元資料や作業環境の期限、依頼の5分の期限は進む。</p></li>
      <li><span>03 · 作業再開</span><h4>券を確認して続きを依頼</h4><code>/api/run</code><p>所有者・期限・改変・使用済み・設定版などを確認し、回答を追加してClaudeへ渡す。</p></li>
    </ol>
    <div className={styles.ticketStores}><section><h4>ブラウザが預かるもの</h4><p>会話を暗号化した、一度限りの継続券。画面に表示する依頼・結果・質問回答。</p></section><section><h4>共通の保存先が預かるもの</h4><p>所有者、暗号化の鍵、券の照合用の値、資料・生成物のID、期限など。</p></section></div>
    <p className={styles.figureFootnote}>この図は自由な依頼の継続方式です。定型業務の再開券は暗号化ではなく改変・再送を検証する別形式。いずれも再読み込み後の会話再開画面はありません。</p>
    <FigureSources paths={["lib/conversation.ts", "lib/run-state.ts", "app/api/run/route.ts"]} />
  </figure>;
}

export function DeploymentArchitecture() {
  return <figure className={styles.architectureFigure} aria-labelledby="deployment-architecture">
    <figcaption><span>図5 · 実際に動く場所</span><h3 id="deployment-architecture">仕事の分担は同じ、置く場所が変わる</h3></figcaption>
    <div className={styles.deploymentColumns}>
      <section><h4>手元の開発</h4><div className={styles.hostGroup}><span>あなたのMacの中</span><div className={styles.deploymentNode}><strong>ブラウザ</strong><small>http://localhost:3000</small></div><p className={styles.hostArrow}>↓ 依頼・設定の読込</p><div className={styles.deploymentNode}><strong>Next.jsの開発サーバー</strong><small>npm run dev</small></div><div className={styles.deploymentStore}><strong>↔ .local/ の記録</strong><small>Redisを設定していない場合</small></div></div><p className={styles.hostArrow}>↓ APIで外部へ依頼・応答を受け取る</p><div className={styles.externalNode}><span>外部サービス</span><strong>Anthropic / Claude</strong><small>元資料の送信・コード実行・結果提出</small></div></section>
      <section><h4>公開時の予定構成</h4><div className={styles.deploymentNode}><strong>あなたのPCのブラウザ</strong><small>公開先のURLを開く</small></div><p className={styles.hostArrow}>↓ インターネット経由で依頼</p><div className={styles.hostGroup}><span>公開先 · Vercel（予定）</span><div className={styles.deploymentNode}><strong>Next.jsのサーバー処理</strong><small>受付・設定・検算・外部通信</small></div></div><div className={styles.deploymentStore}><strong>↔ Upstash Redis</strong><small>アプリから読み書き。設定と枠を共有</small></div><p className={styles.hostArrow}>↓ APIで外部へ依頼・応答を受け取る</p><div className={styles.externalNode}><span>外部サービス</span><strong>Anthropic / Claude</strong><small>元資料の送信・コード実行・結果提出</small></div></section>
    </div>
    <p className={styles.figureFootnote}>開発でもRedisを設定すればRedisを使います。公開用でRedisが未設定・利用不可の場合、ローカル保存へ戻さず停止します。公開・実接続の確認が済んだことを示す図ではありません。</p>
    <FigureSources paths={["package.json", "app/page.tsx", "lib/security-store.ts", "docs/PUBLIC_READINESS.md"]} />
  </figure>;
}
