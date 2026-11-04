export const architectureNodes = [
  { title: "あなたの画面", place: "ブラウザ", label: "依頼する・確認する", description: "経理担当者の机に当たる場所です。入力・添付選択・質問回答・結果表示を担当します。Reactが画面を切り替え、送信と応答の表示をつなぎます。", receives: "あなたの依頼文・選択した資料と、サーバーから届く質問・結果。", returns: "依頼・設定の版・添付券・質問への回答。保存ボタンでは結果を端末へダウンロード。", reason: "担当者が操作と確認に集中できるようにします。APIキーは預けず、会話を再読み込み後に再開する保存も設けていません。", files: "components/Agent.tsx、components/GeneralFiles.tsx、components/FollowupForm.tsx", paths: ["components/Agent.tsx", "components/GeneralFiles.tsx", "components/FollowupForm.tsx"] },
  { title: "アプリの受付", place: "Next.jsサーバー", label: "調べる・つなぐ・検算する", description: "依頼の受付係と提出物の確認係です。ブラウザの入力を再確認し、同じ保存済みマスタをAI参照と仕訳の独立検算に使います。Claudeとの往復もここで管理します。", receives: "画面からの依頼や券、保存先の共通設定、Claudeからの質問や提出結果。", returns: "Claudeへ仕事の材料と使える道具を渡し、画面へ進み具合・質問・結果・検算を返す。", reason: "秘密のAPIキーをサーバー側に置き、モデル・回数・入力の制限を共通で確認するためです。AIの提出形式と仕訳を検査する担当もここに集めます。", files: "app/api/run/route.ts、lib/configuration.ts、lib/journal.ts", paths: ["app/api/run/route.ts", "lib/configuration.ts", "lib/journal.ts"] },
  { title: "Claudeの作業場所", place: "Anthropicの外部サービス", label: "手順を読む・計算する・提出する", description: "外部の作業担当に当たります。指示と資料を読み、コード実行ツールで計算するよう依頼されます。Python等の計算はAnthropic側の環境で行われます。", receives: "基本指示・業務マニュアル・保存済みマスタ・依頼文・元資料・過去のやり取り。", returns: "コード実行の応答、ask_userによる確認依頼、submit_resultによる報告書・表・仕訳案など。", reason: "資料に応じて手順を組み立て、計算や質問を進めるためです。API利用料が発生し、資料の外部送信と保持条件を確認する必要があります。", files: "app/api/run/route.ts、lib/knowledge.ts", paths: ["app/api/run/route.ts", "lib/knowledge.ts"] },
  { title: "共通の記録", place: "手元の.local/ またはRedis", label: "設定・枠・券の確認情報を保つ", description: "共有のルールと受付台帳を保管する係です。マスタ・手順・履歴・固定控えのほか、回数枠、同時実行枠、券と資料IDの一時情報を扱います。", receives: "サーバーからの読込・更新・回数確認・券の消費などの命令。画面が直接読み書きする保存先ではありません。", returns: "現在の設定、保存の成功・版違い、利用可否や待ち時間、所有者付きの一時情報。", reason: "処理が分かれても同じ基準と同じ枠を使うためです。元資料の本文や会話本文を恒久的に保管する場所ではありません。", files: "lib/security-store.ts、lib/security-store-local.ts、lib/configuration.ts", paths: ["lib/security-store.ts", "lib/security-store-local.ts", "lib/configuration.ts"] },
] as const;

export const flowSteps = [
  { title: "依頼を書く", actor: "あなたの画面", file: "components/Agent.tsx", text: "「架空の経費を部門別に集計して」という依頼と資料を用意します。まだどこにも送っていません。" },
  { title: "資料を送る", actor: "受付係 → AIの作業場所", file: "app/api/uploads/route.ts", text: "「実行」を押すと、資料を1つずつ確かめてから送ります。送った資料は、引換券（添付券）でまとめます。" },
  { title: "受付でチェック", actor: "受付係", file: "app/api/run/route.ts", text: "どこから来たか、量と形、回数、設定の版、引換券の持ち主と期限を確かめます。問題なければ受け付けます。" },
  { title: "基準を渡す", actor: "受付係 → AI", file: "lib/configuration.ts、lib/masters.ts", text: "保存してあるマスタとマニュアルを取り出し、依頼文や資料と一緒にAIへ渡します。" },
  { title: "作業・質問", actor: "AI ↔ あなた", file: "app/api/run/route.ts、lib/run-state.ts", text: "AIがプログラムで資料を読んで計算します。迷ったら、あなたに質問するか、要確認事項に回します。" },
  { title: "結果を提出", actor: "AI → 受付係", file: "lib/general-result.ts、lib/journal.ts", text: "AIが報告書・表・仕訳などを決まった形で提出します。受付係が形と量を確かめます。" },
  { title: "仕訳を検算", actor: "受付係", file: "lib/journal.ts", text: "仕訳があれば、貸借・科目・部門・日付・金額をAIとは別にチェックします。一般の集計表には、このチェックはありません。" },
  { title: "確かめて保存", actor: "あなた", file: "components/Agent.tsx", text: "元の資料と件数・金額・保留の理由を見比べます。検算NGの仕訳はCSVで保存できません。必要な結果を保存します。" },
] as const;

export const codeExamples = [
  { title: "同じ設定を読む", path: "lib/configuration.ts", meaning: "保存済みのマスタがあればそれを使い、未設定のときだけ初期値を使います。空配列は削除済みなので初期値へ戻しません。", lines: [
    { code: "const { stored, version, tasks, baseMasters } = await readStored();", explanation: "保存した内容、現在の版、業務定義、初期マスタをまとめて読み込みます。" },
    { code: "const masters = stored?.masters ?? baseMasters.map((m) => m.kind === \"rules\" ? { ...m, content: stored?.expenseRules ?? m.content } : m);", explanation: "保存済みmastersが未設定の場合だけ初期マスタを使います。??は空配列を未設定扱いしないので、削除が維持されます。" },
    { code: "const currentRules = masters.find((m) => m.kind === \"rules\")?.content ?? \"\";", explanation: "選んだ同じマスタ一覧から、経費精算規程の本文を取り出します。" },
  ] },
  { title: "Claudeに依頼する", path: "app/api/run/route.ts", meaning: "SDKの通信処理に、利用モデル・回答量・考える量を渡します。この後ろに基本指示・マスタ・手順・ツール・会話を指定します。", lines: [
    { code: "const stream = client.beta.messages.stream({", explanation: "Claudeへ依頼を送り、応答を少しずつ受け取る準備をします。clientはサーバー側で作った通信の道具です。" },
    { code: "  model: model.id,", explanation: "サーバー側で許可されたモデルのIDを指定します。画面から勝手なモデルを渡しても許可範囲は広がりません。" },
    { code: "  max_tokens: policy.maxOutputTokens,", explanation: "その環境の利用ポリシーに従って、最大の回答量を制限します。" },
    { code: "  output_config: { effort: state.effort },", explanation: "確認済みのエフォート（考える量）を渡します。ここまでが実コードの連続した抜粋です。残りの引数と閉じ括弧は省略しています。" },
  ] },
  { title: "仕訳を独立検算する", path: "lib/journal.ts", meaning: "借方・貸方の不一致を、AIの説明ではなく数値の比較で見つけます。実際はこのほかに合計・マスタ・日付・金額も調べます。", lines: [
    { code: "const unbalanced = entries.filter((e) => e.debit_amount !== e.credit_amount);", explanation: "仕訳一覧から、1行の借方金額と貸方金額が違うものだけを取り出します。" },
    { code: "checks.push({", explanation: "画面に返す検算結果の一覧へ、ひとつの確認結果を追加します。" },
    { code: "  ok: unbalanced.length === 0,", explanation: "不一致が0件なら、この確認項目をOKにします。" },
    { code: "  label: \"行ごとの貸借一致\",", explanation: "担当者が分かるように、この確認に日本語の名前を付けます。" },
    { code: "  detail: unbalanced.length ? `不一致：${unbalanced.map((e) => e.voucher_no).join(\"、\")}` : undefined,", explanation: "不一致があれば伝票番号を並べます。なければ詳細は付けません。" },
    { code: "});", explanation: "この項目の追加を終えます。これは各行の貸借確認で、仕訳の業務的な正しさの判定ではありません。" },
  ] },
  { title: "AI参照と検算をつなぐ", path: "app/api/run/route.ts", meaning: "提出された仕訳に、実行時と同じ保存済みマスタを明示的に渡す接続点です。", lines: [
    { code: "send({ type: \"status\", message: \"結果を確認しています\" });", explanation: "画面へ『結果を確認しています』という進み具合を送ります。" },
    { code: "const checked = { checks: checkEntries(result.entries, masterChecks(configuration.masters)), csv: toCsv(result.entries) };", explanation: "checkEntriesが仕訳を検算し、toCsvが安全確認付きでCSVにします。検算結果とCSVをまとめ、後で画面へ返します。" },
  ] },
  { title: "公開時に安全に止める", path: "lib/security-store.ts", meaning: "公開用Redisが使えないとき、別々のローカル記録へ戻して制限を抜けさせないための分岐です。", lines: [
    { code: "if (process.env.NODE_ENV !== \"production\" && !process.env.VERCEL) {", explanation: "公開用ではなく、Vercel上でもない、手元の開発の場合だけ次へ進みます。" },
    { code: "  const { localCommand } = await import(\"@/lib/security-store-local\");", explanation: "開発で必要になったときだけ、ローカル保存の処理を読み込みます。" },
    { code: "  return await localCommand(op, storeKey, value, ttl);", explanation: "開発用ファイルに対して、読み書きや回数確認の命令を実行します。" },
    { code: "}", explanation: "手元の開発に限定した分岐が終わります。" },
    { code: "throw new SecurityUnavailableError();", explanation: "公開用なのに共有保存が使えなければエラーで止めます。制限を無効にして続行しません。" },
  ] },
] as const;

export const quizQuestions = [
  { question: "金額の計算と、仕訳のチェックは誰が担当する？", options: ["AIが暗算し、同じAIが正しさを保証する", "AIがプログラムで計算し、アプリが仕訳を別にチェックする", "ブラウザに入れたExcelだけで処理する"], answer: 1, explanation: "AIにはプログラムで計算するよう指示し、提出された仕訳はアプリの検算係（checkEntries）が別にチェックします。", chapter: "core" },
  { question: "検算がすべてOKなら、何が言える？", options: ["資料の読み漏れも規程の読み方も、すべて正しい", "決まったチェック項目は通ったが、元の資料との照合や判断は必要", "もう会計ソフトに自動で登録された"], answer: 1, explanation: "貸借やマスタなどのチェックを通ったという意味です。資料の拾い漏れや規程の読み方までは分かりません。", chapter: "safety" },
  { question: "業務画面を再読み込みすると、会話はどうなる？", options: ["自動で前の会話に戻る", "設定もマスタも全部消える", "会話の続きはできない。保存したマスタなどの設定は残る"], answer: 2, explanation: "会話は画面の中だけにあります。マスタや設定の履歴は保存先に残るので、別の扱いです。", chapter: "architecture" },
  { question: "「編集する」メニューには、どんな意味がある？", options: ["管理者だけが編集できるようにする", "見る画面と変える画面を分ける。編集できる人を限る仕組みではない", "押した人だけログインする"], answer: 1, explanation: "いまはログインがありません。アクセスできる人は誰でも編集画面に進めるので、公開する範囲は別に決めます。", chapter: "overview" },
  { question: "公開したときに共有の保存先（Redis）が使えなくなったら？", options: ["制限を外して処理を続ける", "それぞれのサーバーの手元の記録に切り替える", "回数の制限などを守れないので、エラーで止まる"], answer: 2, explanation: "公開時は共有の保存先が必要です。記録を消したり手元の記録に切り替えたりして、制限を外すことはしません。", chapter: "operations" },
] as const;
