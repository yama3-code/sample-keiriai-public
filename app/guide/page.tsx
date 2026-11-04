import Link from "next/link";
import { guideChapters, guideGroups } from "@/lib/guide/navigation";
import { guideFiles } from "@/lib/guide/files";
import { ChapterStatus, GuideProgressSummary } from "@/components/guide/GuideProgress";
import { Illust } from "@/components/guide/Illustrations";
import styles from "@/components/guide/Guide.module.css";

export default function GuideHome() {
  return <div className={styles.cover}>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>しくみを知る、自分の道具になる。</p><h1>この仕組みを、<br />自分の言葉で<br /><em>説明できるように。</em></h1><p className={styles.heroDescription}>「AIが動いている」の、その先へ。<br />いつもの経理の仕事を入口に、画面の裏側を<br className={styles.desktopBreak} />ひとつずつ見ていく学習ガイドです。</p><div className={styles.heroActions}><Link href="/guide/quick" className={styles.primaryButton}>まず3分で全体をつかむ <span aria-hidden="true">→</span></Link><Link href="/guide/overview" className={styles.secondaryButton}>最初の章から読む</Link></div><p className={styles.heroNote}>全12章 · 専門知識は不要 · 自分のペースで</p></div>
      <div className={styles.heroDiagram} aria-label="依頼、作業、検算、担当者の確認という4つの役割"><div className={styles.diagramLabel}>経理の仕事から、しくみを見る</div><ol><li><span>01</span><Illust name="person" size={44} /><div><small>あなた</small><strong>目的と資料を渡す</strong></div></li><li><span>02</span><Illust name="ai" size={44} /><div><small>Claude</small><strong>手順を読み、計算する</strong></div></li><li><span>03</span><Illust name="checker" size={44} /><div><small>アプリ</small><strong>仕訳を別に検算する</strong></div></li><li><span>04</span><Illust name="person" size={44} /><div><small>あなた</small><strong>根拠を見て、判断する</strong></div></li></ol><p>AIの作業と、人の判断。<br />その間をプログラムがつなぎます。</p></div>
    </section>
    <GuideProgressSummary />
    <section className={styles.readingPaths} aria-labelledby="reading-path"><div className={styles.sectionHeading}><h2 id="reading-path">知りたいところからでも、大丈夫。</h2><span>3つの読み方</span></div><div className={styles.pathGrid}><Link href="/guide/overview"><span>まずは全体を</span><strong>01 → 02 → 03</strong><p>全体像・配置図・処理の順番。<br />最初の3章で流れをつかむ。</p></Link><Link href="/guide/manual"><span>使い方を確かめたい</span><strong>08 → 07 → 09</strong><p>操作・仕様・安全対策。<br />実際の仕事に結び付けて読む。</p></Link><Link href="/guide/stack"><span>コードにも触れてみたい</span><strong>04 → 05 → 06</strong><p>技術・ファイル・中心処理。<br />短いコードを日本語で読む。</p></Link></div></section>
    <section aria-labelledby="all-chapters" className={styles.curriculum}><div className={styles.sectionHeading}><h2 id="all-chapters">学習の目次</h2><span>12 chapters</span></div>{guideGroups.map((group, groupIndex) => <section key={group} className={styles.chapterGroup}><div className={styles.groupHeading}><span>PART {groupIndex + 1}</span><h3>{group}</h3></div><div className={styles.chapterGrid}>{guideChapters.map((chapter, i) => chapter.group === group ? <Link href={`/guide/${chapter.slug}`} key={chapter.slug} className={styles.chapterCard}><span className={styles.chapterNumber}>{String(i + 1).padStart(2, "0")}</span><div><span className={styles.cardMeta}>読む目安 {chapter.minutes}分{chapter.slug === "files" ? ` · ${guideFiles.length}ファイル` : ""}</span><h4>{chapter.title}</h4><ChapterStatus slug={chapter.slug} /><p>{chapter.description}</p></div><span className={styles.cardArrow} aria-hidden="true">↗</span></Link> : null)}</div></section>)}</section>
    <aside className={styles.coverNote}><span className={styles.smallLabel}>このガイドの読み方</span><p>文章は実際のコードと説明書をもとにしています。図や練習の操作は学習用で、AIへの依頼や設定の保存は行いません。用語で迷ったら「用語辞典」へ。実装の変更に合わせて、この説明も更新していきます。</p><Link href="/guide/glossary">用語辞典を開く →</Link></aside>
  </div>;
}
