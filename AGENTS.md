<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# プロジェクトの決まりごと（経理AIエージェント）

詳しい使い方・設計は `README.md`、公開前の確認事項は `docs/PUBLIC_READINESS.md` を読んでから作業すること。

## 依頼者とのやりとり
- 依頼者は非エンジニア。報告・説明・質問は **すべて日本語** で、専門用語には簡単な補足を付ける。
- 作業の区切りごとに「何をしたか」と「依頼者がやること」を、やさしい言葉で伝える。
- コード内のコメントとコミットメッセージも日本語で書く。コミットは頼まれたときだけ行う。

## 変えてはいけないこと
- AI は Claude API（`@anthropic-ai/sdk`）を使う。他社のSDKに置き換えない。API キーはサーバー側（Route Handler）だけで扱い、コードに書かない。
- 金額の計算は Claude のコード実行ツールで行わせ、結果は `lib/journal.ts` の `checkEntries()` でAIとは別に検算する。
- 判断できないことは仕訳にせず「要確認事項」に回す（または `ask_user` で担当者に質問する）。
- 依頼者の2026-11-02の変更指示により、ログインは設けない。誰でも利用・編集できるが、通常画面は閲覧専用とし「編集する」メニューからのみ編集画面へ進む。業務実行・保存の回数制限と送信元確認は維持する。
- 共通データは「マスタ設定」で追加・差し替え・削除できる。通常は閲覧専用で「編集する」から編集する。実行時のAI参照と `checkEntries()` の検算には、同じ保存済みマスタを使う。削除済みマスタを初期値で補わない。
- `.env.local` の中身を表示・コミットしない。
- データはすべて架空（株式会社サンプル商事）。実在の会社名・人名を使わない。

## 確認のしかた
- `npx tsc --noEmit` → `npm run lint` → `npm run build`
- 画面を変えたら、パソコン幅とスマホ幅（375px）の両方で、横にはみ出さないことを確認する。
- API を実際に呼ぶと依頼者に料金がかかるため、確認は必要最小限にする（軽い確認は Haiku 5.5・エフォート low）。
