import type { Metadata } from "next";
import Link from "next/link";
import GuideNav, { type GuideSearchItem } from "@/components/guide/GuideNav";
import { guideArticles } from "@/lib/guide/content";
import { guideChapters } from "@/lib/guide/navigation";
import { guideFiles } from "@/lib/guide/files";
import { detailTopics } from "@/lib/guide/detail";
import { architectureNodes, codeExamples, flowSteps, quizQuestions } from "@/lib/guide/examples";
import styles from "@/components/guide/Guide.module.css";

export const metadata: Metadata = {
  title: { default: "経理AIのしくみ｜システム学習ガイド", template: "%s｜経理AIのしくみ" },
  description: "非エンジニアの経理担当者のための、経理AIエージェントの全体像・構成・コード・仕様・操作ガイド。",
  robots: { index: false, follow: false },
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  const extraText: Record<string, string> = {
    files: guideFiles.map((file) => `${file.path} ${file.role} ${file.place}`).join(" "),
    architecture: architectureNodes.map((node) => `${node.title} ${node.description} ${node.receives} ${node.returns} ${node.reason} ${node.files}`).join(" "),
    flow: flowSteps.map((step) => `${step.title} ${step.text} ${step.file}`).join(" "),
    core: codeExamples.map((example) => `${example.title} ${example.path} ${example.meaning} ${example.lines.map((line) => `${line.code} ${line.explanation}`).join(" ")}`).join(" "),
    check: quizQuestions.map((question) => `${question.question} ${question.explanation}`).join(" "),
  };
  const searchIndex: GuideSearchItem[] = guideChapters.map((chapter) => ({ slug: chapter.slug, title: chapter.title, text: `${guideArticles[chapter.slug].body} ${extraText[chapter.slug] ?? ""}`.replace(/[#*|>`]/g, " ").replace(/\s+/g, " ") }));
  // 3分で分かる版も検索で見つかるようにする（本編12章とは別の入口ページ）。
  // くわしく読む（詳細版）の各ページも検索対象にする。
  searchIndex.unshift(...detailTopics.map((topic) => ({ slug: `detail/${topic.slug}`, title: `くわしく読む：${topic.title}`, text: `${topic.description} ${topic.body}`.replace(/[#*|>`]/g, " ").replace(/\s+/g, " ") })));
  searchIndex.unshift({ slug: "quick", title: "3分で分かる、経理AIのしくみ", text: "3分で分かる版 下書き係 チェック係 旅費 新幹線 仕訳案 要確認事項 タクシー 検算 マスタ設定" });
  return <div className={styles.site}>
    <a href="#guide-content" className="skip-link">解説本文へ進む</a>
    <header className={styles.siteHeader}><Link href="/guide" className={styles.brand}><span className={styles.brandMark} aria-hidden="true">学</span><span><small>経理担当者のためのシステム学習ガイド</small><strong>経理AIのしくみ</strong></span></Link>{process.env.GUIDE_SITE_ONLY !== "1" && <Link href="/" className={styles.returnLink}>業務画面へ →</Link>}</header>
    <div className={styles.siteBody}><GuideNav index={searchIndex} /><main id="guide-content" className={styles.main}>{children}<footer className={styles.footer}><span>経理AIエージェント / 株式会社サンプル商事（架空）</span><span>実装を学ぶためのガイド · 2026.11.03</span></footer></main></div>
  </div>;
}
