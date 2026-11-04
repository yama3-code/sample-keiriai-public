import Link from "next/link";
import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownLink from "@/components/MarkdownLink";
import { detailTopics, parseFaq, type DetailTopic } from "@/lib/guide/detail";
import { detailFigures } from "./DetailFigures";
import styles from "./Guide.module.css";
import d from "./Detail.module.css";

const FAQ_HEADING = "よくある疑問";

function DetailText({ text }: { text: string }) {
  return <div className={`${styles.prose} ${d.prose}`}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img"]} components={{
    h2: ({ children }) => <h2 id={String(children)}>{children}</h2>,
    a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
    table: ({ children }) => <div className={styles.tableWrap}><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>;
}

/** 「よくある疑問」を、開け閉めできる質問カードにする。 */
function Faq({ text }: { text: string }) {
  const items = parseFaq(text);
  return <section aria-labelledby={FAQ_HEADING}>
    <div className={styles.prose}><h2 id={FAQ_HEADING}>{FAQ_HEADING}</h2></div>
    <div className={d.faq}>{items.map((item) => <details key={item.q} className={d.faqItem}>
      <summary><span className={d.faqMark} aria-hidden="true">Q</span><span>{item.q}</span></summary>
      <div className={d.faqAnswer}><span className={d.faqMark} aria-hidden="true">A</span><p>{item.a}</p></div>
    </details>)}</div>
  </section>;
}

// 見出しごとに本文を区切り、対応する図をその直後に置く。
function DetailBody({ topic }: { topic: DetailTopic }) {
  const figures = detailFigures[topic.slug] ?? {};
  return topic.body.split(/(?=^## )/m).filter((section) => section.trim()).map((section) => {
    const heading = section.match(/^## (.+)/)?.[1] ?? "introduction";
    if (heading === FAQ_HEADING) return <Faq key={heading} text={section} />;
    return <Fragment key={heading}><DetailText text={section} />{figures[heading]}</Fragment>;
  });
}

export default function DetailArticle({ topic }: { topic: DetailTopic }) {
  const index = detailTopics.findIndex((item) => item.slug === topic.slug);
  const previous = detailTopics[index - 1];
  const next = detailTopics[index + 1];
  const headings = [...topic.body.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
  return <article className={styles.article}>
    <header className={styles.articleHeader}>
      <div className={styles.breadcrumb}><Link href="/guide">ガイドの表紙</Link><span aria-hidden="true">/</span><Link href="/guide/detail">くわしく読む</Link><span aria-hidden="true">/</span><span>{topic.short}</span></div>
      <p className={styles.eyebrow}>DETAIL {String(index + 1).padStart(2, "0")} <span>{topic.group} · 読む目安 {topic.minutes}分</span></p>
      <h1>{topic.title}</h1>
      <p className={styles.articleLead}>{topic.description}</p>
    </header>
    <div className={d.scene}><span>こんなときに：{topic.scene}</span></div>
    <aside className={styles.takeaway}><span>このページの要点</span><p>{topic.takeaway}</p></aside>
    <nav className={styles.toc} aria-label="このページの目次"><strong>このページでわかること</strong><ul>{headings.map((heading) => <li key={heading}><a href={`#${encodeURIComponent(heading)}`}>{heading}</a></li>)}</ul></nav>
    <DetailBody topic={topic} />
    <p className={d.pageNote}><strong>このページの数字と画面の言葉について</strong><br />2026年11月の実装と、同梱の架空サンプル（株式会社サンプル商事）にもとづいています。マニュアルやマスタを画面で変更していると、結果の数字は変わります。しくみをもっと知りたいときは、本編12章や用語辞典もあわせて読んでください。</p>
    <nav className={styles.pageTurns} aria-label="前後のページ"><Link href={previous ? `/guide/detail/${previous.slug}` : "/guide/detail"}><span>← {previous ? "前のページ" : "くわしく読む の目次"}</span><strong>{previous?.short ?? "目次へ戻る"}</strong></Link>{next ? <Link href={`/guide/detail/${next.slug}`}><span>次のページ →</span><strong>{next.short}</strong></Link> : <Link href="/guide/glossary"><span>読み終えたら</span><strong>用語辞典で復習する →</strong></Link>}</nav>
  </article>;
}
