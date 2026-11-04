import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import GuideArticle from "@/components/guide/GuideArticle";
import { guideChapters } from "@/lib/guide/navigation";
import styles from "@/components/guide/Guide.module.css";

export function generateStaticParams() {
  return guideChapters.map((chapter) => ({ chapter: chapter.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }): Promise<Metadata> {
  const { chapter } = await params;
  const item = guideChapters.find((item) => item.slug === chapter);
  return { title: item?.title ?? "章が見つかりません", description: item?.description };
}

export default function ChapterPage({ params }: { params: Promise<{ chapter: string }> }) {
  return <Suspense fallback={<div className={styles.article} role="status"><p>章の内容を開いています…</p></div>}><CurrentChapter params={params} /></Suspense>;
}

async function CurrentChapter({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  const item = guideChapters.find((item) => item.slug === chapter);
  if (!item) notFound();
  return <GuideArticle slug={item.slug} />;
}
