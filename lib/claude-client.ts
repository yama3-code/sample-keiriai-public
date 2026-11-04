import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// 秘密の鍵を使う接続をサーバーだけに集約し、外部向けの詳細ログを無効にする。
export function createClaudeClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Claude APIキーが設定されていません。");
  return new Anthropic({
    apiKey,
    authToken: null,
    baseURL: "https://api.anthropic.com",
    logLevel: "off",
    dangerouslyAllowBrowser: false,
  });
}
