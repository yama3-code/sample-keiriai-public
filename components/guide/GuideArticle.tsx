import Link from "next/link";
import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownLink from "@/components/MarkdownLink";
import { guideArticles } from "@/lib/guide/content";
import { fileAnchor } from "@/lib/guide/files";
import { guideChapters, type GuideSlug } from "@/lib/guide/navigation";
import FileExplorer from "./FileExplorer";
import { ChapterCompletion } from "./GuideProgress";
import { chapterFigures } from "./ChapterFigures";
import fig from "./Figures.module.css";
import styles from "./Guide.module.css";

function ArticleText({ text }: { text: string }) {
  return <div className={styles.prose}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img"]} components={{
    h2: ({ children }) => <h2 id={String(children)}>{children}</h2>,
    a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
    table: ({ children }) => <div className={styles.tableWrap}><table>{children}</table></div>,
  }}>{text}</ReactMarkdown></div>;
}

const DETAIL_PREFIX = "もっと詳しく：";

// 見出しごとに本文を区切り、対応する図をその直後に置く。
// 「もっと詳しく：」で始まる節は、読まなくても使える補足として折りたたむ。
function ChapterBody({ slug, text }: { slug: GuideSlug; text: string }) {
  const figures = chapterFigures[slug] ?? {};
  return text.split(/(?=^## )/m).filter((section) => section.trim()).map((section) => {
    const heading = section.match(/^## (.+)/)?.[1] ?? "introduction";
    if (heading.startsWith(DETAIL_PREFIX)) {
      const title = heading.slice(DETAIL_PREFIX.length);
      return <details key={heading} className={fig.details} id={heading}><summary>もっと詳しく：{title}<small>読まなくても使えます</small></summary><div className={fig.detailsBody}><ArticleText text={section.replace(/^## .+\n/, "")} />{figures[heading]}</div></details>;
    }
    return <Fragment key={heading}><ArticleText text={section} />{figures[heading]}</Fragment>;
  });
}

export default function GuideArticle({ slug }: { slug: GuideSlug }) {
  const index = guideChapters.findIndex((chapter) => chapter.slug === slug);
  const chapter = guideChapters[index];
  const article = guideArticles[slug];
  const previous = guideChapters[index - 1];
  const next = guideChapters[index + 1];
  const headings = [...article.body.matchAll(/^## (.+)$/gm)].map((match) => match[1]).filter((heading) => !heading.startsWith(DETAIL_PREFIX));
  return <article className={styles.article}>
    <header className={styles.articleHeader}><div className={styles.breadcrumb}><Link href="/guide">ガイドの表紙</Link><span aria-hidden="true">/</span><span>{chapter.short}</span></div><p className={styles.eyebrow}>CHAPTER {String(index + 1).padStart(2, "0")} <span>{chapter.group} · 読む目安 {chapter.minutes}分</span></p><h1>{chapter.title}</h1><p className={styles.articleLead}>{chapter.description}</p></header>
    <aside className={styles.takeaway}><span>この章の要点</span><p>{article.takeaway}</p></aside>
    <nav className={styles.toc} aria-label="この章の目次"><strong>この章でわかること</strong><ul>{headings.map((heading) => <li key={heading}><a href={`#${encodeURIComponent(heading)}`}>{heading}</a></li>)}{slug === "files" ? <li><a href="#file-catalog">ファイル案内を検索する</a></li> : null}</ul></nav>
    {slug === "overview" ? <div className={styles.overviewStrip}><div><span>あなたが渡す</span><strong>依頼・資料・基準</strong></div><span aria-hidden="true">→</span><div><span>AIとアプリが行う</span><strong>作業・提出・検算</strong></div><span aria-hidden="true">→</span><div><span>あなたが受け取る</span><strong>結果・確認事項</strong></div></div> : null}
    <ChapterBody slug={slug} text={article.body} />
    {slug === "files" ? <FileExplorer /> : null}
    <ChapterCompletion slug={slug} />
    <section className={styles.sources} aria-labelledby="source-files"><h2 id="source-files">この説明の根拠となるファイル</h2><p>名前を選ぶと、ファイル案内で役割を確認できます。</p><ul>{article.sources.map((path) => <li key={path}><Link href={`/guide/files#${fileAnchor(path)}`}>{path}</Link></li>)}</ul></section>
    <nav className={styles.pageTurns} aria-label="前後の章"><Link href={previous ? `/guide/${previous.slug}` : "/guide"}><span>← {previous ? "前の章" : "表紙"}</span><strong>{previous?.short ?? "ガイドの表紙"}</strong></Link>{next ? <Link href={`/guide/${next.slug}`}><span>次の章 →</span><strong>{next.short}</strong></Link> : <Link href="/guide"><span>学習をひと区切り</span><strong>全体を見返す →</strong></Link>}</nav>
  </article>;
}
