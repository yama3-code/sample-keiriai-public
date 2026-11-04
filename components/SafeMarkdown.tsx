import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import MarkdownLink from "./MarkdownLink";

const components: Components = {
  a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
};

// 保存済みの手順やAIの回答に画像が含まれても、外部へ自動通信させない。
export default function SafeMarkdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={["img"]} skipHtml>{children}</ReactMarkdown>;
}
