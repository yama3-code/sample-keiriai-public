import type { ReactNode } from "react";
import { Compare, Figure, Flow, Grid, Stats, Steps, Talk } from "./Illustrations";
import fig from "./Figures.module.css";
import { codeReadings } from "@/lib/guide/detail-code";
import d from "./Detail.module.css";

// 「くわしく読む」の図。キーは lib/guide/detail.ts の slug と、見出し（## の後ろ）の文字。
// 見出しを変えるときは、ここも合わせて直すこと。
// 数字は tasks/ の同梱サンプル（架空）とマニュアルから計算したもの。

type ScreenItem = { title: string; text: ReactNode; button?: string; key?: boolean };

/** 実際の画面を簡単にした見取り図。番号は本文の説明の順番。 */
function Screen({ title, items }: { title: string; items: ScreenItem[] }) {
  return <div className={d.screen} role="img" aria-label={`${title}の見取り図`}>
    <div className={d.screenBar}><i /><i /><i /><span>{title}</span></div>
    <div className={d.screenBody}>{items.map((item, i) => <div key={item.title} className={`${d.screenRow} ${item.key ? d.key : ""}`}>
      <span className={d.screenNo}>{i + 1}</span>
      <div><strong>{item.title}</strong><p>{item.text}</p>{item.button ? <span className={d.screenButton}>{item.button}</span> : null}</div>
    </div>)}</div>
  </div>;
}

/** 計算の式を箱で並べる。 */
function Calc({ parts }: { parts: ({ label: string; value: string; result?: boolean } | string)[] }) {
  return <div className={d.calc}>{parts.map((part, i) => typeof part === "string"
    ? <span key={i} className={d.calcOp} aria-hidden="true">{part}</span>
    : <div key={i} className={`${d.calcBox} ${part.result ? d.result : ""}`}><small>{part.label}</small><strong>{part.value}</strong></div>)}</div>;
}


/** 実際のコードを、1行ずつ日本語の説明と並べて見せる。 */
function CodeRead({ id }: { id: string }) {
  const reading = codeReadings.find((item) => item.id === id);
  if (!reading) return null;
  return <Figure title={reading.title} caption={`${reading.path} より（実際のコードそのまま）`}>
    <ol className={d.codeRead}>{reading.lines.map((line, i) => <li key={i}>
      <code>{line.code}</code>
      <p>{line.explanation}</p>
    </li>)}</ol>
  </Figure>;
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

// PCリース料 1,980,000円の台数基準の配賦（端数3円は開発部へ）
const leaseShares = [
  { name: "開発部", count: 182, amount: 1047561, note: "端数3円を加算" },
  { name: "営業部", count: 75, amount: 431686 },
  { name: "マーケティング部", count: 30, amount: 172674 },
  { name: "管理部", count: 28, amount: 161162, note: "管理部に残る（仕訳なし）", muted: true },
  { name: "経理部", count: 13, amount: 74825 },
  { name: "人事部", count: 11, amount: 63313 },
  { name: "役員室", count: 5, amount: 28779 },
];

export const detailFigures: Record<string, Record<string, ReactNode>> = {
  workday: {
    "全体の流れを先に見る": <Figure title="1回の仕事は、7つの動作" caption="5・6・7の3つが、あなたの判断がいちばん大切なところです。">
      <Steps items={[
        { icon: "browser", who: "あなた", title: "業務を選ぶ", text: "4つの業務から1つ" },
        { icon: "mail", who: "あなた", title: "やってほしいことを書く", text: "対象・ほしい結果・出し方・迷ったとき" },
        { icon: "sheet", who: "あなた", title: "資料を渡す", text: "選んだだけでは、まだ送られない" },
        { icon: "gear", who: "あなた", title: "設定を確かめて「実行」を押す", text: "ここから利用料がかかる" },
        { icon: "question", who: "あなた", title: "質問が来たら答える", text: "分からなければ「保留に」で大丈夫" },
        { icon: "checker", who: "あなた", title: "結果を確かめる", text: "まず要確認事項から" },
        { icon: "ledger", who: "あなた", title: "保存して、終える", text: "会計ソフトへの登録はあなたが行う" },
      ]} />
    </Figure>,
    "動作2：やってほしいことを書く": <Figure title="業務画面の見取り図（入力するところ）" caption="実際の画面を簡単にした絵です。番号の順に上から入力していきます。">
      <Screen title="業務画面 ― AI経理エージェント" items={[
        { title: "業務を選ぶ", text: "AI経理エージェント／PC経費配賦／旅費仕訳／四半期決算整理" },
        { title: "やってほしいこと（依頼文）", text: "最大10,000文字。対象・ほしい結果・出し方・迷ったときの扱いを書く", key: true },
        { title: "資料", text: "CSV・Excel・PDF・画像を最大15個。定型業務は区分ごとにCSVを選ぶ" },
        { title: "AIモデル／エフォート（考える深さ）／途中で質問してもらう", text: "最初はHaiku・低。質問をオフにすると、迷った事項は要確認へ" },
        { title: "実行", text: "押すと資料が送られ、作業が始まる（1〜3分ほど）", button: "この業務を実行する", key: true },
      ]} />
    </Figure>,
    "動作5：質問が来たら答える": <Figure title="質問のやりとりの例" caption="旅費の明細で、AIが規程にない理由を見つけたときの例です（架空）。">
      <Talk lines={[
        { icon: "ai", who: "AI", text: "明細9の宿泊費13,500円は、大阪市の上限12,000円を超えています。備考に「展示会会場の近くが満室のため」とあります。仕訳にしますか、保留にしますか？" },
        { icon: "person", who: "あなた", text: "規程に例外の定めがないので、保留にしてください。申請者に確認します。", side: "right" },
        { icon: "ai", who: "AI", text: "承知しました。明細9は保留とし、要確認事項に理由と規程第10条第4項を記載します。" },
      ]} />
    </Figure>,
    "動作6：結果を確かめる": <Figure title="結果画面の見取り図" caption="上から順に並びます。おすすめの見る順番は、オレンジの欄から。">
      <Screen title="結果の表示" items={[
        { title: "報告書（回答）", text: "何をしたかの要約と、AIの回答" },
        { title: "表", text: "集計表など。表ごとにCSVで保存できる", button: "表をCSVで保存" },
        { title: "仕訳", text: "仕訳を作ったときだけ出る", button: "仕訳CSVをダウンロード" },
        { title: "プログラムによる検算", text: "AIとは別のプログラムが、7つの項目を確かめた結果。NGがあるとCSVは保存できない" },
        { title: "要確認事項", text: "AIが決めずに残したこと。最初に読む", key: true },
        { title: "手順ごとの作業ログ", text: "どの資料の何行を対象にし、何を除いたか", key: true },
      ]} />
    </Figure>,
  },
  travel: {
    "22行の判定を、全部見る": <Figure title="22行の行き先" caption="マニュアルどおりに処理した場合の見込みです。">
      <Stats items={[
        { value: "22", unit: "行", label: "渡す明細（10件の申請）" },
        { value: "15", unit: "行", label: "仕訳にする" },
        { value: "7", unit: "行", label: "保留（要確認事項へ）" },
        { value: "1", unit: "行", label: "仕訳にするが「期限超過」を記載（明細22）" },
      ]} />
    </Figure>,
    "保留の7行を、もう少しくわしく": <Figure title="よく似ているのに、結果が分かれる組み合わせ" caption="AIが取り違えやすいところです。結果を見るときは、ここを重点的に。">
      <Compare
        left={{ title: "仕訳にする", icon: "check", tone: "ok", points: [<>明細4：タクシー <b>23:50</b> 乗車（深夜帰宅に当たる）</>, <>明細14：グリーン車を <b>役員</b> が利用</>, <>明細11：横浜までの <b>交通費</b></>, <>明細20・21：同じ申請の、問題のない行</>] }}
        right={{ title: "保留にする", icon: "stop", tone: "stop", points: [<>明細13：タクシー <b>21:30</b> 乗車（22時前）</>, <>明細19：グリーン車を <b>一般の従業員</b> が利用</>, <>明細12：横浜への <b>日当</b>（100km未満）</>, <>明細16〜18：3か月超えの申請は <b>申請ごと全部</b></>] }}
      />
    </Figure>,
    "仮払金の精算": <Figure title="仮払K-0031の精算" caption="仮払のほうが多いので、差額は返金として仕訳にします。">
      <Calc parts={[{ label: "仮払額", value: yen(80000) }, "−", { label: "精算した明細5〜7", value: yen(75200) }, "＝", { label: "返金（普通預金／仮払金）", value: yen(4800), result: true }]} />
    </Figure>,
    "数字で答え合わせ": <Figure title="結果画面で、まず見比べる数字">
      <Stats items={[
        { value: "16", unit: "行", label: "仕訳の行数（明細15行＋返金1行）" },
        { value: "225,980", unit: "円", label: "借方・貸方の合計" },
        { value: "7", unit: "行", label: "保留の明細" },
        { value: "4,800", unit: "円", label: "仮払K-0031の返金" },
      ]} />
    </Figure>,
  },
  allocation: {
    "6つの費用と、その行き先": <Figure title="配賦区分で、行き先が4つに分かれる">
      <Grid columns={4} items={[
        { icon: "laptop", title: "台数基準", text: "明細1・3・4。PCの台数の比率で", tone: "ok" },
        { icon: "people", title: "人数基準", text: "明細2。部門の人数の比率で", tone: "ok" },
        { icon: "folder", title: "配賦対象外", text: "明細5。仕訳なし、作業ログに記録", tone: "plain" },
        { icon: "warning", title: "要確認", text: "明細6。区分が空欄なので配賦しない", tone: "warn" },
      ]} />
    </Figure>,
    "PCリース料を、実際に計算する": <Figure title="PCリース料1,980,000円の行き先" caption="棒の長さは、台数の比率（全344台）です。">
      <ul className={d.bars}>{leaseShares.map((row) => <li key={row.name}>
        <span className={d.barLabel}>{row.name}</span>
        <span className={d.barTrack} aria-hidden="true"><span className={`${d.barFill} ${row.muted ? d.muted : ""}`} style={{ width: `${(row.count / 344) * 100}%`, display: "block" }} /></span>
        <span className={d.barValue}>{yen(row.amount)}<small>{row.count}台{row.note ? `・${row.note}` : ""}</small></span>
      </li>)}</ul>
    </Figure>,
    "足りない端数は、どこへ？": <Figure title="端数の行き先" caption="切り捨てで足りない3円を、台数がいちばん多い開発部に足します。">
      <Calc parts={[{ label: "元の金額", value: yen(1980000) }, "−", { label: "切り捨て後の合計", value: yen(1979997) }, "＝", { label: "端数 → 開発部へ", value: "3円", result: true }]} />
    </Figure>,
    "数字で答え合わせ": <Figure title="結果画面で、まず見比べる数字">
      <Stats items={[
        { value: "24", unit: "行", label: "仕訳の行数（4費目×6部門）" },
        { value: "3,514,310", unit: "円", label: "借方・貸方の合計" },
        { value: "1", unit: "件", label: "配賦対象外（明細5）" },
        { value: "1", unit: "件", label: "要確認（明細6）" },
      ]} />
    </Figure>,
  },
  "ai-mind": {
    "AIは毎回、5点セットを読み直す": <Figure title="実行のたびに渡す5点セット" caption="AIは覚えているのではなく、毎回これを読み直して作業します。">
      <Grid columns={3} items={[
        { icon: "book", title: "基本の指示", text: "計算はプログラムで。迷ったら質問か保留" },
        { icon: "folder", title: "業務のマニュアル", text: "手順と、止まる条件" },
        { icon: "cabinet", title: "マスタ", text: "科目表・部門・規程（保存済みのもの）" },
        { icon: "mail", title: "あなたの依頼文", text: "今回やってほしいこと" },
        { icon: "sheet", title: "資料", text: "選んだファイル（定型業務は未選択分にサンプル）" },
      ]} />
    </Figure>,
    "AIが使える3つの道具": <Figure title="AIが使える道具は、この3つだけ">
      <Grid columns={3} items={[
        { icon: "calculator", title: "計算の道具", text: "その場でプログラムを書いて計算する" },
        { icon: "question", title: "質問の窓口", text: "迷ったら画面であなたに質問する" },
        { icon: "check", title: "提出の窓口", text: "決まった形で結果を提出する" },
      ]} />
    </Figure>,
    "なぜ暗算させないのか": <Figure title="暗算とプログラムの違い">
      <Compare
        left={{ title: "AIの暗算", icon: "warning", tone: "warn", points: ["長い計算で、もっともらしい間違いをすることがある", "同じ問題でも、答えが揺れることがある"] }}
        right={{ title: "プログラムでの計算", icon: "calculator", tone: "ok", points: ["電卓と同じで、同じ式なら毎回同じ答え", "端数処理などの決まりを、そのとおりに守れる"] }}
      />
    </Figure>,
    "モデルとエフォートの選び方": <Figure title="つまみの選び方の目安">
      <Compare
        left={{ title: "Haiku・低", icon: "clock", tone: "plain", points: ["速くて安い（最初に選ばれている）", "動作の確認、単純な集計に", "まずはこれで試す"] }}
        right={{ title: "Sonnet・中", icon: "ai", tone: "plain", points: ["時間と料金は多めにかかる", "規程の判断が多い仕事、複雑な決算整理に", "判断がおかしいと感じたら試し直す"] }}
      />
    </Figure>,
  },
  checker: {
    "チェック係とは": <Figure title="チェック係の持ち場">
      <Flow items={[
        { icon: "ai", who: "AI", title: "仕訳を提出する" },
        { icon: "checker", who: "チェック係", title: "7つの項目を確かめる" },
        { icon: "check", title: "全部OK", text: "CSVで保存できる", tone: "ok" },
        { icon: "stop", title: "NGがある", text: "CSVで保存できない", tone: "stop" },
      ]} />
    </Figure>,
    "「行ごと」もある理由": <Figure title="全体は合っているのに、行ごとでは合っていない例">
      <div><table className={d.mini}>
        <thead><tr><th scope="col">行</th><th scope="col">借方</th><th scope="col">貸方</th><th scope="col">行ごと</th></tr></thead>
        <tbody>
          <tr><td>1行目</td><td>29,540円</td><td>29,440円</td><td className={d.bad}>NG</td></tr>
          <tr><td>2行目</td><td>12,000円</td><td>12,100円</td><td className={d.bad}>NG</td></tr>
          <tr><td>合計</td><td>41,540円</td><td>41,540円</td><td className={d.good}>全体はOK</td></tr>
        </tbody>
      </table></div>
    </Figure>,
    "チェック係が見逃すもの": <Figure title="チェック係が見つけるもの・見逃すもの">
      <Compare
        left={{ title: "見つける（形の間違い）", icon: "check", tone: "ok", points: ["貸借の不一致（全体・行ごと）", "科目表にない科目、名前の違い", "部門マスタにない部門", "ありえない日付、0円やマイナス"] }}
        right={{ title: "見逃す（判断の間違い）", icon: "warning", tone: "warn", points: ["保留にすべき明細を仕訳にした", "科目の選び方が違う", "借方・貸方を同じだけ間違えた", "明細の拾い漏れ、規程の読み違い"] }}
      />
    </Figure>,
  },
  "master-care": {
    "見る画面と、変える画面": <Figure title="マスタを変えるまでの4歩">
      <Flow items={[
        { icon: "browser", title: "マスタ設定", text: "最初は見るだけ" },
        { icon: "gear", title: "編集する", text: "編集の画面へ" },
        { icon: "checker", title: "変更内容を確認する", text: "違いを一覧で見る" },
        { icon: "cabinet", title: "この内容で保存する", text: "全員の次の実行から反映", tone: "ok" },
      ]} />
    </Figure>,
    "2人が同時に変えたら": <Figure title="同時に保存しようとしたとき" caption="あとから保存しようとした人には、案内が出ます。">
      <Talk lines={[
        { icon: "person", who: "Aさん", text: "部門マスタの人数を直して、保存しました。" },
        { icon: "people", who: "Bさん", text: "（同じ版を開いたまま）勘定科目表を直して保存…", side: "right" },
        { icon: "checker", who: "アプリ", text: "新しい版があります。Aさんの変更を消さないよう、最新の内容を読み込んでから、もう一度変更してください。" },
      ]} />
    </Figure>,
    "間違えたら、3つの戻し先": <Figure title="戻し先は3つ" caption="どれに戻しても、手順・規程・マスタの「設定全体」が戻ります。">
      <Grid columns={3} items={[
        { icon: "restore", title: "最近の変更履歴", text: "直近10版まで" },
        { icon: "lock", title: "保護した控え", text: "最初に保存する前の内容。普段の保存では消えない" },
        { icon: "book", title: "アプリの初期値", text: "配布したときの内容" },
      ]} />
    </Figure>,
  },
  "money-safety": {
    "秘密の鍵（APIキー）は金庫にしまう": <Figure title="鍵の扱い方">
      <Compare
        left={{ title: "してはいけない", icon: "stop", tone: "stop", points: ["依頼文・マスタに貼る", "チャットやメールで送る", "GitHubに保存する", "画面の写真に写したまま送る"] }}
        right={{ title: "漏れたかもと思ったら", icon: "key", tone: "warn", points: ["文章を消すだけでは足りない", "管理画面で古い鍵を無効にする", "新しい鍵に取り替える", "すぐに開発の担当者へ相談"] }}
      />
    </Figure>,
    "渡した資料の行き先": <Figure title="「実行」を押したあとの資料の道のり">
      <Flow items={[
        { icon: "browser", who: "あなたの画面", title: "資料を選ぶ", text: "選んだだけでは送らない" },
        { icon: "shield", who: "受付係", title: "形式と大きさを確かめる", text: "中身は保存先にしまわない" },
        { icon: "cloud", who: "Anthropic社", title: "AIが読んで作業する", text: "元の資料は2時間の期限付き" },
      ]} />
    </Figure>,
  },
  trouble: {
    "まず、3つのことを守る": <Figure title="困ったときの3つの約束">
      <Grid columns={3} items={[
        { icon: "stop", title: "何度も押さない", text: "作業が進んでいることがある", tone: "warn" },
        { icon: "browser", title: "メッセージを読む", text: "理由と次にすることが書いてある" },
        { icon: "sheet", title: "結果を先に保存", text: "再読み込みで会話は続けられなくなる" },
      ]} />
    </Figure>,
  },

  "program-map": {
    "6つの持ち場": <Figure title="6つの持ち場の位置関係" caption="あなたの画面からAIへ、直接つながる線はありません。必ず受付を通ります。">
      <Flow items={[
        { icon: "browser", who: "画面", title: "依頼を書く・結果を見る", text: "components/" },
        { icon: "shield", who: "受付", title: "確かめて取り次ぐ", text: "app/api/" },
        { icon: "cloud", who: "外部のAI", title: "読む・計算する", text: "Anthropic社" },
      ]} />
      <div className={fig.figureGap}><Grid columns={3} items={[
        { icon: "gear", who: "道具箱", title: "受付が使う道具", text: "lib/（検算・設定・安全対策）", tone: "plain" },
        { icon: "book", who: "基準の棚", title: "配布時の初期値", text: "tasks/・data/", tone: "plain" },
        { icon: "cabinet", who: "保存先", title: "画面で変えた設定", text: ".local/ または Redis", tone: "plain" },
      ]} /></div>
    </Figure>,
  },
  "run-inside": {
    "全体は5つの段階": <Figure title="受付の中の5つの段階" caption="段階1・2で止まれば、AIは呼ばれません。">
      <Steps items={[
        { icon: "shield", who: "場面1〜4", title: "確かめる", text: "送り主・量・設定の版・モデル" },
        { icon: "ticket", who: "場面5〜7", title: "準備する", text: "実行中の札・回数・資料の引換券" },
        { icon: "ai", who: "場面8〜10", title: "AIとやり取りする", text: "材料と道具を渡し、返事で行き先が分かれる" },
        { icon: "checker", who: "場面11", title: "検算する", text: "同じマスタでチェック係が確かめる" },
        { icon: "trash", who: "場面12", title: "後片付けする", text: "資料の削除を試み、札を返す" },
      ]} />
    </Figure>,
    "場面6：回数を数える": <Figure title="まとめて数える理由">
      <Compare
        left={{ title: "1つずつ数えると", icon: "warning", tone: "warn", points: ["ブラウザの枠：1回減る", "全体の枠：満杯で断られる", "→ 断られたのに、ブラウザの枠だけ減ってしまう"] }}
        right={{ title: "まとめて数えると", icon: "check", tone: "ok", points: ["全部の枠を先に確かめる", "1つでも満杯なら、どれも減らさない", "→ 断られたときは、回数も元のまま"] }}
      />
    </Figure>,
    "場面10：AIの返事で、行き先が分かれる": <Figure title="AIとの往復の様子" caption="1回の「実行」で、このやり取りが何度か繰り返されます。">
      <Talk lines={[
        { icon: "shield", who: "受付", text: "指示・マスタ・マニュアル・依頼文・資料と、3つの道具を渡します。よろしくお願いします。" },
        { icon: "ai", who: "AI", text: "（計算の道具で）手順1：入力データの確認…手順2：規程チェック…", side: "right" },
        { icon: "ai", who: "AI", text: "明細9は規程にない例外なので、担当者に確認したいです。（質問の窓口を使う）", side: "right" },
        { icon: "shield", who: "受付", text: "質問と引換券を画面へ送り、いったん通信を終えます。" },
      ]} />
    </Figure>,
  },
  "code-reading": {
    "例1：行ごとの貸借一致（チェック係）": <CodeRead id="balance" />,
    "例2：日付の形式（チェック係）": <CodeRead id="date" />,
    "例3：マスタを、チェック係用の一覧に変える": <CodeRead id="masters" />,
    "例4：提出を一度だけ催促する（受付）": <CodeRead id="nudge" />,
  },
  "settings-inside": {
    "初期値の上に、変更を重ねる": <Figure title="2つの層を重ねて読む">
      <Flow arrow="＋" items={[
        { icon: "book", who: "下の層", title: "初期値", text: "tasks/・data/ のファイル。画面からは書き換えない" },
        { icon: "cabinet", who: "上の層", title: "保存した変更", text: ".local/ または Redis。削除も「ない」と記録する" },
      ]} />
      <div className={fig.figureGap}><Flow arrow="＝" items={[
        { icon: "gear", title: "いまの設定", text: "AIへの材料にも、チェック係の一覧にも、これを使う", tone: "ok" },
      ]} /></div>
    </Figure>,
    "版番号は、内容から作る指紋": <Figure title="内容が変わると、指紋も変わる" caption="番号は説明のための例です（実際はもっと長い番号です）。">
      <Compare
        left={{ title: "部門マスタ：営業部 70人", icon: "sheet", tone: "plain", points: ["版番号の例：3f9a…c21"] }}
        right={{ title: "部門マスタ：営業部 71人", icon: "sheet", tone: "warn", points: ["版番号の例：b07e…5d8", "1文字違うだけで、まったく別の番号になる"] }}
      />
    </Figure>,
  },
  "guard-inside": {
    "関門を重ねて守る": <Figure title="依頼が通る関門" caption="左から順に通ります。どこかで止まれば、その先には進みません。">
      <Flow items={[
        { icon: "globe", title: "送り主", text: "このアプリの画面からか" },
        { icon: "sheet", title: "量と形", text: "大きすぎないか" },
        { icon: "lock", title: "実行中の札", text: "同時に動かしすぎていないか" },
        { icon: "clock", title: "回数", text: "使いすぎていないか" },
        { icon: "key", title: "鍵", text: "受付だけがAIへつなぐ", tone: "ok" },
      ]} />
    </Figure>,
    "秘密の鍵を、1つの部屋に閉じ込める": <Figure title="鍵が置いてある場所・置いていない場所">
      <Compare
        left={{ title: "置いてある", icon: "lock", tone: "ok", points: ["受付のサーバーの設定（環境変数）", "使うのは lib/claude-client.ts だけ"] }}
        right={{ title: "置いていない", icon: "stop", tone: "stop", points: ["あなたの画面（ブラウザ）", "マスタ・マニュアル・依頼文", "GitHub・このガイド"] }}
      />
    </Figure>,
  },
  "resume-inside": {
    "答えを待つ間、通信をつなぎっぱなしにしない": <Figure title="質問から再開までの流れ">
      <Flow items={[
        { icon: "ai", who: "AI", title: "質問する" },
        { icon: "ticket", who: "受付", title: "引換券を画面へ渡し、通信を終える" },
        { icon: "person", who: "あなた", title: "答える" },
        { icon: "shield", who: "受付", title: "券を確かめて、一度だけ使う" },
        { icon: "ai", who: "AI", title: "続きを作業する", tone: "ok" },
      ]} />
    </Figure>,
    "再開の券が確かめる5つのこと": <Figure title="券の5つの確認">
      <Grid columns={3} items={[
        { icon: "browser", title: "同じブラウザか" },
        { icon: "clock", title: "期限内か" },
        { icon: "shield", title: "書き換えられていないか" },
        { icon: "ticket", title: "まだ使っていないか" },
        { icon: "gear", title: "設定の版が同じか" },
      ]} />
    </Figure>,
  },
};
