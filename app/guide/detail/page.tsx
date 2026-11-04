import type { Metadata } from "next";
import Link from "next/link";
import { Illust } from "@/components/guide/Illustrations";
import { detailGroupInfo, detailGroups, detailTopics } from "@/lib/guide/detail";
import styles from "@/components/guide/Guide.module.css";
import d from "@/components/guide/Detail.module.css";

export const metadata: Metadata = {
  title: "くわしく読む（非エンジニア向けの詳細版）",
  description: "経理担当者の仕事の場面ごとの使い方、自分のパソコンで動かす準備（環境構築）、プログラムのしくみを、専門用語なしでくわしく説明する。",
};

export default function DetailHome() {
  const total = detailTopics.reduce((sum, topic) => sum + topic.minutes, 0);
  return <article className={styles.article}>
    <header className={styles.articleHeader}>
      <div className={styles.breadcrumb}><Link href="/guide">ガイドの表紙</Link><span aria-hidden="true">/</span><span>くわしく読む</span></div>
      <p className={styles.eyebrow}>DETAIL GUIDE <span>全{detailTopics.length}ページ · 合計 約{total}分 · 専門用語なし</span></p>
      <h1>くわしく読む ― 経理担当者のための詳細版</h1>
      <p className={styles.articleLead}>仕事の場面ごとの使い方、自分のパソコンで動かす準備、プログラムのしくみを、くわしく説明します。</p>
    </header>

    <div className={d.intro}>
      <div>
        <p>このページ群は、プログラムを書かない経理担当者のための <b>詳細版</b> です。3つの区分に分かれています。</p>
        <ul className={d.introList}>
          <li><b>使う人の目線</b>：画面のどこを見て、何を押し、結果をどう確かめるか（同梱の架空サンプルの数字つき）</li>
          <li><b>実際に使う準備</b>：自分のパソコンで動かすための環境構築（コマンドとお願いの例つき）</li>
          <li><b>プログラムのしくみ</b>：画面の裏側を、ファイル名と実際のコードを添えて</li>
        </ul>
        <p>どのページから読んでもかまいません。困ったときや、結果を確かめたいときに、その場面のページを開いてください。</p>
      </div>
      <div className={d.introArt} aria-hidden="true"><Illust name="person" size={84} /><Illust name="book" size={84} /></div>
    </div>

    <aside className={d.setupCallout} aria-label="自分のパソコンで動かしたい方へ">
      <Illust name="laptop" size={56} />
      <div><strong>これから自分のパソコンで動かす方へ</strong><p>「準備の全体像」から順に進めると、道具の準備から試運転まで迷わず終えられます。GitHubの非公開リポジトリ・公開リポジトリのどちらからでも始められます。</p><Link href="/guide/detail/setup-overview" className={styles.primaryButton}>準備の全体像を開く <span aria-hidden="true">→</span></Link></div>
    </aside>

    <h2 className={d.sectionTitle}>このガイドの3つの読み方</h2>
    <ul className={d.ways}>
      <li><small>3分</small><strong>3分で分かる版</strong><p>旅費の明細1行を例に、全体の流れだけをつかむ。</p><Link href="/guide/quick">開く →</Link></li>
      <li className={d.current}><small>いま見ているページ</small><strong>くわしく読む</strong><p>使い方・動かす準備・プログラムのしくみをくわしく。</p></li>
      <li><small>しくみを学ぶ</small><strong>本編12章</strong><p>画面の裏側の部品やファイルまで、しくみの順に学ぶ。</p><Link href="/guide/overview">1章から読む →</Link></li>
    </ul>

    {detailGroups.map((group, groupIndex) => <section key={group} aria-labelledby={`detail-group-${groupIndex}`}>
      <h2 id={`detail-group-${groupIndex}`} className={d.sectionTitle}>{detailGroupInfo[group].heading}</h2>
      <p className={d.groupLead}>{detailGroupInfo[group].lead}</p>
      <ol className={d.topics}>{detailTopics.map((topic, i) => topic.group === group ? <li key={topic.slug}>
        <Link href={`/guide/detail/${topic.slug}`} className={d.topic}>
          <span className={d.topicNo}>{i + 1}</span>
          <div><span className={d.topicScene}>{topic.scene}</span><strong>{topic.title}</strong><p>{topic.description}</p><span className={d.topicMeta}>読む目安 {topic.minutes}分</span></div>
        </Link>
      </li> : null)}</ol>
    </section>)}

    <p className={d.pageNote}><strong>はじめての方へのおすすめ</strong><br />使い方を知りたい方は「1回の仕事の流れ」から、自分のパソコンで動かしたい方は「準備の全体像」から読み始めてください。読むだけなので、AIは動かず、料金もかかりません。</p>
  </article>;
}
