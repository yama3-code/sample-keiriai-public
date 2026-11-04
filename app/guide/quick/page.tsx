import type { Metadata } from "next";
import Link from "next/link";
import { Illust } from "@/components/guide/Illustrations";
import styles from "@/components/guide/Guide.module.css";
import quick from "@/components/guide/QuickGuide.module.css";

export const metadata: Metadata = {
  title: "3分で分かる版",
  description: "旅費精算の1明細を例に、資料を渡してから仕訳案を確認するまでの流れを3分でつかむ。",
};

// 例の数字は tasks/02-travel-journal の同梱サンプル（架空）と、そのマニュアルの仕訳ルールに合わせている。
// 検算の項目は lib/journal.ts の checkEntries() に合わせている。
export default function QuickGuide() {
  return <article className={styles.article}>
    <header className={styles.articleHeader}>
      <div className={styles.breadcrumb}><Link href="/guide">ガイドの表紙</Link><span aria-hidden="true">/</span><span>3分で分かる版</span></div>
      <p className={styles.eyebrow}>QUICK GUIDE <span>読む目安 3分 · 専門用語なし</span></p>
      <h1>3分で分かる、経理AIのしくみ</h1>
      <p className={styles.articleLead}>旅費精算の明細を1つ例にして、資料を渡してから仕訳案を確認するまでを追いかけます。</p>
    </header>

    <aside className={styles.takeaway}><span>ひとことで言うと</span><p>AIが「下書き係」、プログラムが「チェック係」になって仕訳案を作り、最後にあなたが確認して決める道具です。</p></aside>

    <section aria-labelledby="quick-steps">
      <h2 id="quick-steps" className={quick.heading}>流れは4ステップ</h2>
      <p className={quick.lead}>例として、営業部の社員が提出した大阪出張の新幹線代（架空のサンプル）を使います。</p>
      <ol className={quick.steps}>
        <li className={quick.step}>
          <div className={quick.stepHead}><span className={quick.stepNo}>1</span><Illust name="sheet" size={48} /><div><small>あなた</small><strong>資料を渡す</strong></div></div>
          <p>旅費明細のCSV（表計算ソフトで開ける一覧ファイル）を選んで、「実行」を押します。</p>
          <div className={quick.sample} aria-label="渡す明細の例">
            <span className={quick.sampleLabel}>渡す明細（1行目）</span>
            <dl>
              <div><dt>申請No</dt><dd>T-1201</dd></div>
              <div><dt>部門</dt><dd>営業部</dd></div>
              <div><dt>内容</dt><dd>新幹線 東京⇔新大阪 往復</dd></div>
              <div><dt>金額</dt><dd>29,440円</dd></div>
              <div><dt>支払方法</dt><dd>立替（本人が立て替え）</dd></div>
            </dl>
          </div>
        </li>
        <li className={quick.step}>
          <div className={quick.stepHead}><span className={quick.stepNo}>2</span><Illust name="ai" size={48} /><div><small>AI（Claude）</small><strong>マニュアルを読んで下書きする</strong></div></div>
          <p>登録済みの「旅費仕訳のマニュアル」と「経費精算規程」を読み、仕訳案を作ります。金額の計算は、暗算ではなくプログラムで行うよう指示されています。</p>
          <div className={quick.sample} aria-label="AIが作る仕訳案の例">
            <span className={quick.sampleLabel}>AIが作る仕訳案</span>
            <div className={styles.tableWrap}><table className={quick.journal}>
              <thead><tr><th scope="col">借方</th><th scope="col">貸方</th></tr></thead>
              <tbody><tr><td>旅費交通費（営業部）<br /><b>29,440円</b></td><td>未払金<br /><b>29,440円</b></td></tr></tbody>
            </table></div>
            <p className={quick.note}>日付 2025-12-08 · 伝票 TR-T-1201 · 摘要「E1023 大阪出張 新幹線 往復」</p>
          </div>
        </li>
        <li className={quick.step}>
          <div className={quick.stepHead}><span className={quick.stepNo}>3</span><Illust name="checker" size={48} /><div><small>アプリ（プログラム）</small><strong>AIとは別にチェックする</strong></div></div>
          <p>AIの答えをそのまま信じず、決まった項目をプログラムで確かめます。上司が部下の伝票を見直すイメージです。</p>
          <ul className={quick.checks} aria-label="チェックする項目">
            <li><span aria-hidden="true">✓</span>借方と貸方の金額が一致しているか</li>
            <li><span aria-hidden="true">✓</span>勘定科目が、勘定科目表にあるものか</li>
            <li><span aria-hidden="true">✓</span>部門が、部門マスタにあるものか</li>
            <li><span aria-hidden="true">✓</span>日付の形式は正しいか、金額は0より大きいか</li>
          </ul>
        </li>
        <li className={quick.step}>
          <div className={quick.stepHead}><span className={quick.stepNo}>4</span><Illust name="person" size={48} /><div><small>あなた</small><strong>結果を見て、決める</strong></div></div>
          <p>仕訳案・チェック結果・「要確認事項」が画面に出ます。元の資料と見比べて、問題なければCSVで保存し、会計ソフトへの登録はあなたが行います。</p>
          <div className={`${quick.sample} ${quick.caution}`} aria-label="要確認事項の例">
            <span className={quick.sampleLabel}>要確認事項の例（同じ資料の別の行）</span>
            <p>タクシー代 4,300円（21:30乗車）は、規程の「深夜帰宅は22時〜翌5時」に当たらないため、仕訳にせず保留しました。</p>
          </div>
          <p className={quick.note}>AIは迷うものを勝手に決めず、このように保留するか、画面であなたに質問します。</p>
        </li>
      </ol>
    </section>

    <section aria-labelledby="quick-remember" className={quick.block}>
      <h2 id="quick-remember" className={quick.heading}>覚えておくのは、この3つだけ</h2>
      <ol className={quick.points}>
        <li><strong>AIは下書き係。</strong>会計ソフトへの登録や、最後の判断はしません。それはあなたの仕事です。</li>
        <li><strong>チェック係が見るのは「形」です。</strong>貸借や科目名は確かめますが、「資料の拾い漏れがないか」「規程の読み方が正しいか」までは分かりません。そこはあなたが確認します。</li>
        <li><strong>基準はあなたが変えられます。</strong>勘定科目表・部門・規程は「マスタ設定」の「編集する」から変えられ、AIもチェック係も同じ基準を使います。逆に言えば、基準を間違えて保存すると、結果も間違えます。</li>
      </ol>
    </section>

    <section aria-labelledby="quick-skip" className={quick.block}>
      <h2 id="quick-skip" className={quick.heading}>ここは、まだ覚えなくて大丈夫</h2>
      <p className={quick.lead}>本編には「Redis」「API」「CAS」といった言葉が出てきますが、どれも<b>裏側の部品や仕掛けの名前</b>です。使うだけなら知らなくても困りません。気になったときに、本編の章や用語辞典で調べてください。</p>
    </section>

    <nav className={quick.next} aria-label="次に読むページ">
      <Link href="/guide/manual" className={styles.primaryButton}>実際の操作を確かめる <span aria-hidden="true">→</span></Link>
      <Link href="/guide/overview" className={styles.secondaryButton}>本編を1章から読む</Link>
      <Link href="/guide/glossary" className={styles.secondaryButton}>用語辞典を開く</Link>
    </nav>
  </article>;
}
