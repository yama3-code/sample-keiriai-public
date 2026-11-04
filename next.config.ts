import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV === "development";
// PPRの静的な描画と両立するCSPを使う。nonce方式はPPRと併用できないため採用しない。
// Next.jsの画面初期化に必要なインライン処理は許可し、読み込み元と埋め込みを制限する。
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // 手元の編集内容・回数制限の記録は、公開用ファイルに含めない。
  outputFileTracingExcludes: { "**": ["./.local/**/*"] },
  // /data（共通データ）と /tasks（業務）のファイルを、Vercel上のサーバーにも一緒に載せる
  outputFileTracingIncludes: {
    "/": ["./data/**/*", "./tasks/**/*"],
    "/api/run": ["./data/**/*", "./tasks/**/*"],
    "/masters": ["./data/**/*", "./tasks/**/*"],
    "/api/settings": ["./data/**/*", "./tasks/**/*"],
  },
  headers() {
    return [{ source: "/:path*", headers: [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ] }];
  },
};

export default nextConfig;
