export const guideChapters = [
  { slug: "overview", title: "まず、全体像をつかむ", short: "全体像", minutes: 4, group: "しくみを知る", description: "登場人物は4人。誰が何をして、何が返ってくるのか。" },
  { slug: "architecture", title: "システムの見取り図", short: "アーキテクチャー", minutes: 8, group: "しくみを知る", description: "4つの持ち場と、資料の行き先・残るものを図で見る。" },
  { slug: "flow", title: "実行ボタンの、その先", short: "処理の流れ", minutes: 5, group: "しくみを知る", description: "「実行」を押してから結果が出るまでを順番に追う。" },
  { slug: "stack", title: "このシステムを作る道具", short: "言語と技術スタック", minutes: 5, group: "しくみを知る", description: "言語・部品・土台を、Excelにたとえて整理する。" },
  { slug: "files", title: "ファイルをひとつずつ読む", short: "ファイルの役割", minutes: 8, group: "中身を読む", description: "フォルダは仕事別の棚。まず見る3つのファイルも。" },
  { slug: "core", title: "中心となるプログラム", short: "コア処理の解説", minutes: 8, group: "中身を読む", description: "いちばん大事な1行を、カッコの内側から読む。" },
  { slug: "specification", title: "できることと、仕様", short: "仕様書", minutes: 6, group: "中身を読む", description: "4つの約束と、数字で見る上限。" },
  { slug: "manual", title: "操作を、順番に確かめる", short: "使い方・説明書", minutes: 5, group: "使いこなす", description: "お願いの書き方から、マスタの変更・元に戻すまで。" },
  { slug: "safety", title: "何を守り、何を確認するか", short: "検算・安全対策", minutes: 6, group: "使いこなす", description: "チェックで分かること・分からないこと。鍵の守り方。" },
  { slug: "operations", title: "動かす・直す・育てる", short: "運用と困ったとき", minutes: 5, group: "使いこなす", description: "開発と公開の違い、エラー番号の見方、お金のかかるところ。" },
  { slug: "glossary", title: "ことばを経理の感覚に置き換える", short: "用語辞典", minutes: 4, group: "理解を確かめる", description: "専門用語を、経理部の職場にたとえて引き直す。" },
  { slug: "check", title: "自分の言葉で説明してみる", short: "理解度チェック", minutes: 4, group: "理解を確かめる", description: "5問のクイズと、1枚にまとめた全体像。" },
] as const;

export type GuideSlug = (typeof guideChapters)[number]["slug"];
export const guideGroups = ["しくみを知る", "中身を読む", "使いこなす", "理解を確かめる"];
