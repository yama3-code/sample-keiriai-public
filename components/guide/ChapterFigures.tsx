import type { ReactNode } from "react";
import type { GuideSlug } from "@/lib/guide/navigation";
import { Compare, Figure, Flow, Grid, Stats, Steps, Talk } from "./Illustrations";
import { ArchitectureLab, CodeLab, FlowLab, QuizLab } from "./LearningLab";
import { ConversationArchitecture, DeploymentArchitecture, MasterArchitecture, RequestArchitecture } from "./ArchitectureDiagrams";
import fig from "./Figures.module.css";

// 各章の「見出し → その節の直後に置く図」。見出しの文字は lib/guide/content.ts と一致させる。
// 図は学習用の固定の絵で、AIや保存APIは呼ばない。
export const chapterFigures: Partial<Record<GuideSlug, Record<string, ReactNode>>> = {
  overview: {
    "登場人物は4人": <Figure title="4人で1つの仕事をする" caption="下書きを作る人、見直す人、決める人、そしてみんなが見る基準の表。">
      <Grid columns={4} items={[
        { icon: "person", who: "あなた", title: "お願いして、決める", text: "最後に結果を確かめる課長役" },
        { icon: "ai", who: "AI（Claude）", title: "下書きを作る", text: "マニュアルを読んで仕訳案を作る" },
        { icon: "checker", who: "チェック係（アプリ）", title: "別に見直す", text: "AIとは別に、決まった項目を確かめる" },
        { icon: "book", who: "マスタ", title: "共通の基準", text: "勘定科目表・部門・規程など" },
      ]} />
    </Figure>,
    "できる仕事は4種類": <Figure title="画面で選べる4つの仕事">
      <Grid columns={4} items={[
        { icon: "ai", title: "AI経理エージェント", text: "自由にお願いできる。資料も渡せる。追加のお願いもOK" },
        { icon: "laptop", title: "PC経費配賦", text: "PCの台数に合わせて経費を部門へ振り分ける" },
        { icon: "ticket", title: "旅費仕訳", text: "旅費の明細から仕訳。規程に合わないものは保留" },
        { icon: "ledger", title: "四半期決算整理", text: "試算表などから決算整理の仕訳を作る" },
      ]} />
    </Figure>,
    "計算とチェックは別の人が担当": <Figure title="経理のダブルチェックと同じ考え方" note="同じ人が作って同じ人が見直すより、別の人が見直すほうが間違いに気づきやすくなります。">
      <Flow items={[
        { icon: "calculator", who: "AI", title: "計算する", text: "暗算ではなくプログラムで" },
        { icon: "checker", who: "アプリ", title: "チェックする", text: "貸借・科目・部門などを確認" },
        { icon: "person", who: "あなた", title: "確かめて決める", text: "拾い漏れ・規程の読み方を確認" },
      ]} />
    </Figure>,
    "基準になる「マスタ」": <Figure title="1つのマスタを、AIとチェック係の両方が見る" note="基準が同じなので、AIとチェック係の間で食い違いが起きません。その代わり、マスタの間違いはそのまま基準になります。">
      <Flow items={[
        { icon: "book", title: "保存してあるマスタ", text: "勘定科目表・部門・規程" },
        { icon: "ai", title: "AIの参考資料に", text: "下書きを作るときに読む" },
        { icon: "checker", title: "チェックの基準に", text: "下書きと照らし合わせる" },
      ]} />
    </Figure>,
    "いまできること・まだできないこと": <Figure title="いまの完成範囲">
      <Compare
        left={{ title: "できること", icon: "check", tone: "ok", points: ["仕訳や集計表の下書き", "AIからの質問に答える", "結果をCSVで保存する", "マスタを編集する", "設定を元に戻す"] }}
        right={{ title: "まだできないこと", icon: "stop", tone: "stop", points: ["会計ソフトへの自動登録", "会話の保存（閉じると続きはできない）", "追加のお願いのときに資料を足す"] }}
      />
    </Figure>,
  },
  architecture: {
    "4つの持ち場": <Figure title="システムの4つの持ち場" caption="経理部の中にたとえると、こんな配置です。あなたの画面から、AIへ直接お願いすることはありません。">
      <Flow items={[
        { icon: "browser", who: "あなたの画面", title: "あなたの机", text: "依頼を書き、結果を見る" },
        { icon: "desk", who: "受付係（サーバー）", title: "受付・チェック", text: "依頼を受け、AIに渡し、答えを確かめる" },
        { icon: "cloud", who: "AIの作業場所", title: "外部の作業部屋", text: "Anthropic社。AIが読んで計算する" },
      ]} />
      <div className={fig.figureGap}><Grid columns={2} items={[
        { icon: "cabinet", who: "共通の記録（保存先）", title: "共有のキャビネット", text: "マスタ・手順・変更履歴をしまう。受付係だけが出し入れする", tone: "plain" },
        { icon: "key", who: "受付係だけが持つ", title: "AIを使う鍵", text: "APIキーはあなたの画面には渡さない", tone: "warn" },
      ]} /></div>
    </Figure>,
    "なぜ受付係をはさむの？": <Figure title="受付係がいる3つの理由">
      <Grid columns={3} items={[
        { icon: "key", title: "秘密の鍵を守る", text: "AIの鍵は受付係だけが持つ" },
        { icon: "shield", title: "もう一度確かめる", text: "画面の表示は書き換えられることがあるから" },
        { icon: "checker", title: "答えをチェックする", text: "AIの答えをそのまま伝票にしない" },
      ]} />
    </Figure>,
    "資料はどこへ行くの？": <Figure title="資料が運ばれる道" note="資料を選んだだけでは送られません。共有のキャビネットに資料の中身はしまいません。">
      <Flow items={[
        { icon: "sheet", who: "あなたの画面", title: "資料を選ぶ", text: "まだどこにも送らない" },
        { icon: "desk", who: "受付係", title: "1つずつ確かめる", text: "形式や大きさを調べる" },
        { icon: "cloud", who: "Anthropic社", title: "AIが読む", text: "2時間の期限付きで置く" },
      ]} />
    </Figure>,
    "同じ基準を、AIとチェック係の両方に": <Figure title="1回取り出したマスタを、2つの用途に">
      <Flow items={[
        { icon: "cabinet", title: "キャビネットから1回取り出す", text: "今回使うマスタ" },
        { icon: "ai", title: "AIへ：参考資料", text: "これを見て下書きを作る" },
        { icon: "checker", title: "チェック係へ：基準", text: "これと照らし合わせる" },
      ]} />
    </Figure>,
    "AIから質問されたら": <Figure title="質問が来たら、いったん止まって再開する">
      <Talk lines={[
        { icon: "ai", who: "AI", text: "明細6の配賦区分が空欄です。どの部門に配賦しますか？" },
        { icon: "person", who: "あなた", text: "要確認にしておいてください。", side: "right" },
        { icon: "desk", who: "受付係", text: "同じ人からの、期限内の、正しい続きか確認しました。作業を再開します。" },
      ]} />
    </Figure>,
    "何が、どこに残るの？": <Figure title="残るもの・消えるもの">
      <Grid columns={4} items={[
        { icon: "cabinet", title: "マスタや手順", text: "キャビネットに残る。閉じても消えない", tone: "ok" },
        { icon: "browser", title: "依頼と結果の画面", text: "閉じる・再読み込みで続きはできない", tone: "stop" },
        { icon: "check", title: "ガイドの理解記録", text: "あなたのブラウザに残る", tone: "ok" },
        { icon: "clock", title: "渡した資料", text: "AIの作業場所に2時間の期限付き", tone: "warn" },
      ]} />
    </Figure>,
    "2人が同時に保存したら": <Figure title="あとから保存した人の変更で、先の人の変更を消さない">
      <Talk lines={[
        { icon: "person", who: "Aさん", text: "部門を1つ追加して保存しました。（版1 → 版2）" },
        { icon: "people", who: "Bさん", text: "版1を開いたまま、保存しようとしています。", side: "right" },
        { icon: "desk", who: "受付係", text: "新しい版（版2）があります。最新を読み直してから保存してください。" },
      ]} />
    </Figure>,
    "手元で試すときと、公開するとき": <Figure title="役割は同じ、置き場所が変わる">
      <Compare
        left={{ title: "手元で試すとき", icon: "laptop", points: ["画面も受付係も、あなたのパソコンの中", "設定は手元のフォルダに保存", "パソコンを閉じると使えない"] }}
        right={{ title: "公開するとき", icon: "globe", points: ["受付係はインターネット上の公開先へ", "設定は共有の保存先（Redis）へ", "経理AI本体はまだ公開していない"] }}
      />
    </Figure>,
    "もっと詳しく：持ち場ごとの受け取るもの・渡すもの": <ArchitectureLab />,
    "もっと詳しく：1件の依頼の受け渡し": <RequestArchitecture />,
    "もっと詳しく：基準をそろえるしくみ": <MasterArchitecture />,
    "もっと詳しく：質問と追加依頼のつなぎ方": <ConversationArchitecture />,
    "もっと詳しく：手元と公開先の配置": <DeploymentArchitecture />,
  },
  flow: {
    "まず、体験してみる": <FlowLab />,
    "受付で確かめること": <Figure title="受付係の4つのチェック">
      <Grid columns={4} items={[
        { icon: "mail", title: "どこから来たか", text: "このアプリの画面からの依頼か" },
        { icon: "sheet", title: "量と形", text: "大きすぎないか、読める形式か" },
        { icon: "clock", title: "回数", text: "使いすぎ・同時に動かしすぎていないか" },
        { icon: "book", title: "基準の版", text: "画面が古い設定のままではないか" },
      ]} />
    </Figure>,
    "AIとは何度かやり取りする": <Figure title="必要に応じて、何度かくり返す" note="何回まで・何分までという上限があります。">
      <Flow items={[
        { icon: "book", title: "資料を読む" },
        { icon: "code", title: "プログラムで計算" },
        { icon: "checker", title: "結果を見直す" },
        { icon: "mail", title: "提出する" },
      ]} />
    </Figure>,
    "質問されたら、いったん止まる": <Figure title="答えを待つ間も、時計は進む">
      <Flow items={[
        { icon: "question", who: "AI", title: "質問が届く", text: "作業は一時停止" },
        { icon: "person", who: "あなた", title: "画面で答える", text: "分からなければ「保留に」" },
        { icon: "clock", who: "受付係", title: "確かめて再開", text: "1回の依頼は5分まで", tone: "warn" },
      ]} />
    </Figure>,
    "結果は3段階でチェック": <Figure title="3つの関門を通ってから画面に出る">
      <Flow items={[
        { icon: "sheet", title: "① 形のチェック", text: "項目がそろっているか、多すぎないか" },
        { icon: "ledger", title: "② 仕訳の検算", text: "貸借・科目・部門などを照合" },
        { icon: "browser", title: "③ 画面に表示", text: "結果・チェック・要確認事項" },
      ]} />
    </Figure>,
    "結果を見てから、追加でお願いする": <Figure title="続けてお願いできる範囲">
      <Stats items={[{ value: "6", unit: "回", label: "初回を含めた回数" }, { value: "2", unit: "時間", label: "続けられる最長時間" }, { value: "0", unit: "個", label: "途中で足せる資料（新しい依頼で渡す）" }]} />
    </Figure>,
  },
  stack: {
    "Excelにたとえると": <Figure title="プログラムの道具をExcelにたとえると">
      <Grid columns={3} items={[
        { icon: "code", who: "言語", title: "数式の書き方", text: "このシステムはTypeScript" },
        { icon: "calculator", who: "ライブラリ", title: "便利な関数", text: "SUMやVLOOKUPのような部品" },
        { icon: "folder", who: "フレームワーク", title: "ブックのひな形", text: "このシステムはNext.js" },
      ]} />
    </Figure>,
    "このシステムの道具を重ねると": <Figure title="道具は積み木のように重なっている">
      <div className={fig.stack}>
        <div className={fig.stackMain}>
          <div className={fig.stackLayer}><strong>画面の部品</strong><span>React ── ボタンや入力欄を作る</span></div>
          <div className={fig.stackLayer}><strong>土台</strong><span>Next.js ── 画面を出し、受付係を動かす</span></div>
          <div className={fig.stackLayer}><strong>言語</strong><span>TypeScript ── 全部この書き方で書く</span></div>
        </div>
        <div className={fig.stackSide}><strong>外部サービス</strong><span>Anthropic（AI）</span><span>Upstash Redis（保存先）</span><span>Vercel（公開先）</span></div>
      </div>
    </Figure>,
    "外部サービスは3つ": <Figure title="よその会社にお願いしている機能">
      <Grid columns={3} items={[
        { icon: "ai", who: "Anthropic", title: "AIと作業部屋", text: "Claudeの頭脳と、計算をする場所" },
        { icon: "cabinet", who: "Upstash Redis", title: "共有キャビネット", text: "公開時に設定や回数の記録を置く" },
        { icon: "globe", who: "Vercel", title: "公開する場所", text: "このガイドはここで公開中。本体は未公開" },
      ]} />
    </Figure>,
    "完成前の3つの点検": <Figure title="直したら、3つの点検" note="3つとも通っても、AIの答えが正しいことまでは分かりません。">
      <Flow items={[
        { icon: "check", title: "型チェック", text: "入れ物の形が合っているか" },
        { icon: "checker", title: "コード検査", text: "書き方の決まりを守っているか" },
        { icon: "gear", title: "ビルド", text: "公開できる形に組み立てられるか" },
      ]} />
    </Figure>,
  },
  files: {
    "フォルダは仕事別の棚": <Figure title="5つの棚">
      <Grid columns={3} items={[
        { icon: "browser", who: "app/", title: "入口", text: "画面のページと受付の窓口" },
        { icon: "gear", who: "components/", title: "画面の部品", text: "入力欄やボタンなど" },
        { icon: "code", who: "lib/", title: "処理の中身", text: "設定・検算・安全対策" },
        { icon: "book", who: "tasks/・data/", title: "仕事の基準", text: "マニュアルと初期データ" },
        { icon: "checker", who: "tests/", title: "点検係", text: "正しく動くかを確かめる" },
      ]} />
    </Figure>,
    "まず見る3つのファイル": <Figure title="依頼 → 実行 → 検算 の中心線">
      <Flow items={[
        { icon: "browser", who: "components/Agent.tsx", title: "依頼の画面" },
        { icon: "desk", who: "app/api/run/route.ts", title: "受付係" },
        { icon: "ledger", who: "lib/journal.ts", title: "検算係" },
      ]} />
    </Figure>,
    "初期値と、画面で変えた設定は別物": <Figure title="初期値の上に、変更分を重ねて使う">
      <Flow arrow="＋" items={[
        { icon: "book", who: "data/・tasks/", title: "配布した初期値", text: "画面で変えても書き換わらない" },
        { icon: "cabinet", who: ".local/ または Redis", title: "画面で変えた分", text: "別の保存先にしまう" },
      ]} />
    </Figure>,
  },
  core: {
    "プログラムは順番つきの指示書": <Figure title="中心のプログラムは4つの仕事">
      <Flow items={[
        { icon: "cabinet", title: "基準をそろえる", text: "マスタと手順を読む" },
        { icon: "ai", title: "AIに頼む", text: "材料と道具を渡す" },
        { icon: "checker", title: "答えをチェック", text: "仕訳を検算する" },
        { icon: "stop", title: "安全に止める", text: "おかしければ続けない" },
      ]} />
    </Figure>,
    "実際のコードを読んでみる": <CodeLab />,
    "いちばん大事な1行": <Figure title="カッコの内側から読む" caption="checkEntries(result.entries, masterChecks(configuration.masters))">
      <div className={fig.nest}>
        <div className={fig.nestOuter}><span>④ checkEntries(…)　仕訳と一覧を照らし合わせる</span>
          <div className={fig.nestRow}>
            <div className={fig.nestBox}><span>③ result.entries</span><p>AIが提出した仕訳</p></div>
            <div className={fig.nestBox}><span>② masterChecks(…)　チェック用の一覧に変える</span>
              <div className={fig.nestInner}><span>① configuration.masters</span><p>今回読み込んだマスタ</p></div>
            </div>
          </div>
        </div>
      </div>
    </Figure>,
  },
  specification: {
    "4つの基本の約束": <Figure title="このシステムの約束">
      <Grid columns={4} items={[
        { icon: "ai", title: "AIはClaude", text: "金額はプログラムで計算" },
        { icon: "checker", title: "仕訳は別にチェック", text: "AIとは別のプログラムで検算" },
        { icon: "question", title: "迷ったら決めない", text: "質問か要確認事項へ" },
        { icon: "person", title: "登録は人が行う", text: "会計ソフトには登録しない" },
      ]} />
    </Figure>,
    "数字で見る上限": <Figure title="よく使う上限">
      <Stats items={[
        { value: "15", unit: "個", label: "自由なお願いで渡せる資料（1個3MBまで）" },
        { value: "10,000", unit: "文字", label: "依頼文の長さ" },
        { value: "5", unit: "分", label: "1回の依頼の制限時間（答え待ちを含む）" },
        { value: "5", unit: "回", label: "1回の依頼で受けられる質問" },
        { value: "6", unit: "回", label: "追加のお願い（初回を含む）" },
        { value: "2", unit: "時間", label: "続けてお願いできる最長時間" },
      ]} />
    </Figure>,
    "画面の状態の移り変わり": <Figure title="状態の移り変わり">
      <Flow items={[
        { icon: "browser", title: "まだ実行していない" },
        { icon: "mail", title: "送信中" },
        { icon: "gear", title: "作業中", text: "質問が来たら答え待ちに" },
        { icon: "check", title: "結果を表示", text: "自由なお願いは追加もOK" },
      ]} />
    </Figure>,
  },
  manual: {
    "自由なお願いの6ステップ": <Figure title="AI経理エージェントの使い方">
      <Steps items={[
        { icon: "browser", title: "「AI経理エージェント」を選ぶ" },
        { icon: "person", title: "やってほしいことを書く", text: "対象・ほしい結果・迷ったときの扱い" },
        { icon: "sheet", title: "資料を選ぶ", text: "最大15個・1個3MB。選んだだけでは送られない" },
        { icon: "yen", title: "「実行」を押す", text: "ここから利用料がかかる" },
        { icon: "question", title: "質問に答える", text: "分からなければ「保留に」でOK" },
        { icon: "check", title: "結果を確かめて保存", text: "要確認事項と作業ログも読む" },
      ]} />
    </Figure>,
    "伝わるお願いの書き方": <Figure title="伝わるお願いの4つの材料">
      <Grid columns={4} items={[
        { icon: "sheet", title: "対象", text: "どの資料の、どの範囲か" },
        { icon: "ledger", title: "ほしい結果", text: "表か、仕訳か" },
        { icon: "checker", title: "出し方", text: "件数・合計・除外した理由も" },
        { icon: "question", title: "迷ったとき", text: "推測せず質問して、など" },
      ]} />
    </Figure>,
    "定型業務を試す": <Figure title="PC配賦サンプルの正解">
      <Stats items={[{ value: "24", unit: "行", label: "仕訳の行数（4費目 × 6部門）" }, { value: "3,514,310", unit: "円", label: "貸借合計" }]} />
    </Figure>,
    "マスタを変更する": <Figure title="マスタを変える5ステップ">
      <Steps items={[
        { icon: "book", title: "「マスタ設定」で今の内容を見る" },
        { icon: "folder", title: "「現在の設定を書き出す」で控えを保存" },
        { icon: "gear", title: "「編集する」から変更する" },
        { icon: "sheet", title: "Excelなら数式を値に、結合を解除" },
        { icon: "check", title: "変更一覧を確かめて保存", text: "全員の次の実行から反映される" },
      ]} />
    </Figure>,
    "設定を元に戻す": <Figure title="3つの戻し先">
      <Grid columns={3} items={[
        { icon: "restore", title: "最近の履歴", text: "直近10版まで" },
        { icon: "lock", title: "保護された控え", text: "最初に保存する前の内容" },
        { icon: "book", title: "初期値", text: "配布したときの内容" },
      ]} />
    </Figure>,
    "結果を確かめる順番": <Figure title="この順に見ると漏れがない">
      <Flow items={[
        { icon: "warning", title: "要確認事項" },
        { icon: "sheet", title: "対象と除外" },
        { icon: "calculator", title: "件数と合計" },
        { icon: "ledger", title: "科目・部門・日付" },
        { icon: "checker", title: "検算結果" },
        { icon: "check", title: "保存" },
      ]} />
    </Figure>,
  },
  safety: {
    "検算で分かること・分からないこと": <Figure title="チェック係が見られる範囲">
      <Compare
        left={{ title: "チェック係が分かること", icon: "check", tone: "ok", points: ["貸借の合計が合っているか", "科目が勘定科目表と一致するか", "部門が部門マスタにあるか", "日付が実在するか", "金額が0より大きいか"] }}
        right={{ title: "あなたが確かめること", icon: "person", tone: "warn", points: ["正しい費目を選んだか", "すべての明細を拾えたか", "規程や証憑を正しく読めたか", "元の資料と合っているか"] }}
      />
    </Figure>,
    "使いすぎや、なりすましを防ぐ": <Figure title="受付係の見張り">
      <Grid columns={4} items={[
        { icon: "mail", title: "送り主の確認", text: "別のサイトからの依頼は断る" },
        { icon: "clock", title: "量と回数の制限", text: "大きすぎ・使いすぎを止める" },
        { icon: "ticket", title: "引換券の確認", text: "同じブラウザ・期限内・未使用だけ" },
        { icon: "book", title: "基準の版の確認", text: "古い設定での再開は止める" },
      ]} />
    </Figure>,
    "APIキーは金庫の鍵": <Figure title="鍵は受付係の金庫にだけ">
      <Compare
        left={{ title: "置いてよい場所", icon: "lock", tone: "ok", points: ["サーバーの設定（環境変数）だけ"] }}
        right={{ title: "貼ってはいけない場所", icon: "stop", tone: "stop", points: ["依頼文・マスタ", "チャット", "GitHub"] }}
      />
    </Figure>,
    "設定は元に戻せる": <Figure title="3つの戻し先" note="控えも同じ保存先にあるので、大切な設定は「書き出す」で手元にも保存しましょう。">
      <Grid columns={3} items={[
        { icon: "restore", title: "最近の履歴", text: "直近10版まで" },
        { icon: "lock", title: "固定の控え", text: "最初に保存する前の内容。普段は消えない" },
        { icon: "book", title: "初期値", text: "配布したときの内容" },
      ]} />
    </Figure>,
    "資料は、どこに、いつまで": <Figure title="資料の行き先と期限">
      <Grid columns={4} items={[
        { icon: "clock", title: "送った資料", text: "2時間の期限付き。終了時にも削除を試みる", tone: "warn" },
        { icon: "cloud", title: "作業部屋のコピー", text: "すぐに消えるとは限らない", tone: "warn" },
        { icon: "browser", title: "画面の会話", text: "再読み込みで続きはできない", tone: "stop" },
        { icon: "cabinet", title: "設定と履歴", text: "保存先に残る", tone: "ok" },
      ]} />
    </Figure>,
    "公開する前に、残っている確認": <Figure title="公開前のチェックリスト">
      <Steps items={[
        { icon: "yen", title: "Claudeの月額上限と通知" },
        { icon: "cabinet", title: "共有の保存先（Redis）の動作" },
        { icon: "shield", title: "公開先の保護と接続元の制限" },
        { icon: "book", title: "会社の資料管理ルールとの適合" },
      ]} />
    </Figure>,
  },
  operations: {
    "開発と公開の違い": <Figure title="開発と公開は別の段階">
      <Compare
        left={{ title: "開発（手元で試す）", icon: "laptop", points: ["あなたのパソコンの中だけで動く", "直して、試して、点検する", "ビルドが成功しても、まだ公開ではない"] }}
        right={{ title: "公開（みんなが使える）", icon: "globe", points: ["インターネットの公開先で動く", "公開先に置く作業が別に必要", "経理AI本体はまだ。ガイドだけ公開中"] }}
      />
    </Figure>,
    "エラー番号の見方": <Figure title="エラー番号は「どこでつまずいたか」の目印">
      <Grid columns={3} items={[
        { icon: "sheet", who: "400", title: "入力の形がおかしい", text: "形式・文字数を確かめる", tone: "warn" },
        { icon: "restore", who: "409", title: "設定が新しくなった", text: "内容を控えて読み直す", tone: "warn" },
        { icon: "folder", who: "413", title: "大きすぎる", text: "分ける・小さくする", tone: "warn" },
        { icon: "clock", who: "429", title: "回数の上限", text: "表示された時間だけ待つ", tone: "warn" },
        { icon: "cabinet", who: "503", title: "保存先が使えない", text: "管理者に連絡する", tone: "stop" },
      ]} />
    </Figure>,
    "変更するときの順番": <Figure title="プログラムを変える6ステップ">
      <Steps items={[
        { icon: "person", title: "何をどう変えたいか決める", text: "具体例と一緒に" },
        { icon: "book", title: "決まりごとと説明書を読む" },
        { icon: "code", title: "変更して、練習用のテストで確かめる" },
        { icon: "checker", title: "型チェック → コード検査 → ビルド" },
        { icon: "laptop", title: "パソコン幅とスマホ幅で見る" },
        { icon: "folder", title: "説明書とガイドを更新" },
      ]} />
    </Figure>,
    "お金がかかるところ": <Figure title="お金がかかる・かからない">
      <Compare
        left={{ title: "お金がかかる", icon: "yen", tone: "warn", points: ["AIへのお願い（実行・計算）", "公開先や保存先の契約（契約内容による）"] }}
        right={{ title: "お金がかからない", icon: "check", tone: "ok", points: ["このガイドを読む・練習する", "テスト（練習用の返事を使う）"] }}
      />
    </Figure>,
    "お願いの伝え方": <Figure title="改善のお願いは4つの材料で">
      <Grid columns={4} items={[
        { icon: "browser", title: "どの画面で" },
        { icon: "person", title: "何をしたら" },
        { icon: "warning", title: "何が起きたか" },
        { icon: "check", title: "本当はどうなってほしいか" },
      ]} />
    </Figure>,
  },
  glossary: {
    "職場にたとえた地図": <Figure title="経理部にたとえると">
      <Grid columns={3} items={[
        { icon: "browser", who: "ブラウザ", title: "あなたの机" },
        { icon: "desk", who: "サーバー", title: "受付係" },
        { icon: "mail", who: "API", title: "申請書の受け渡し窓口" },
        { icon: "cabinet", who: "Redis", title: "共有のキャビネット" },
        { icon: "lock", who: "環境変数", title: "鍵のかかった金庫" },
        { icon: "book", who: "マスタ", title: "基準の表" },
      ]} />
    </Figure>,
  },
  check: {
    "5問のクイズ": <QuizLab />,
    "学び終えたら、こう説明してみる": <Figure title="1枚にまとめると">
      <Flow items={[
        { icon: "person", who: "あなた", title: "依頼と資料を渡す" },
        { icon: "ai", who: "AI", title: "マニュアルとマスタを見て計算・提出" },
        { icon: "checker", who: "アプリ", title: "仕訳を別にチェック" },
        { icon: "person", who: "あなた", title: "元の資料と照らして判断" },
      ]} />
    </Figure>,
  },
};
