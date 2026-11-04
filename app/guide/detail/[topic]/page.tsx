import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DetailArticle from "@/components/guide/DetailArticle";
import { detailTopics } from "@/lib/guide/detail";

// 「くわしく読む」の各ページ。静的に書き出すため、ページの一覧をあらかじめ渡す。
export const dynamicParams = false;

export function generateStaticParams() {
  return detailTopics.map((topic) => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ topic: string }> }): Promise<Metadata> {
  const { topic } = await params;
  const item = detailTopics.find((item) => item.slug === topic);
  return { title: item ? `${item.short}（くわしく読む）` : "ページが見つかりません", description: item?.description };
}

export default async function DetailPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const item = detailTopics.find((item) => item.slug === topic);
  if (!item) notFound();
  return <DetailArticle topic={item} />;
}
