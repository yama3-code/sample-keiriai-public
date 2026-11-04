export type MarkdownLinkTarget =
  | { kind: "local"; href: string }
  | { kind: "external"; href: string }
  | { kind: "blocked"; reason: string };

const MAX_LINK_LENGTH = 2048;

// URLの見た目とブラウザの解釈が食い違う文字・省略表記は、リンクとして開かせない。
export function markdownLinkTarget(href: string | undefined): MarkdownLinkTarget {
  if (!href) return { kind: "blocked", reason: "リンク先を確認できないため開けません。" };
  if (href.length > MAX_LINK_LENGTH) return { kind: "blocked", reason: "リンク先が長すぎるため開けません。" };
  if (/[\s\p{Cf}\u0000-\u001f\u007f-\u009f\\]/u.test(href) || href.startsWith("//")) {
    return { kind: "blocked", reason: "リンク先の書き方を確認できないため開けません。" };
  }
  if (!/^[a-z][a-z\d+.-]*:/i.test(href)) return { kind: "local", href };
  if (!/^https?:\/\/[^/]/i.test(href)) return { kind: "blocked", reason: "Webサイト以外のリンクは開けません。" };
  if (/^https?:\/\/[^/]*@/i.test(href)) return { kind: "blocked", reason: "利用者情報を含むリンクは開けません。" };
  try {
    const url = new URL(href);
    if (!url.hostname || url.username || url.password || url.href.length > MAX_LINK_LENGTH) {
      return { kind: "blocked", reason: "リンク先の形式を確認できないため開けません。" };
    }
    return { kind: "external", href: url.href };
  } catch {
    return { kind: "blocked", reason: "リンク先の形式を確認できないため開けません。" };
  }
}
