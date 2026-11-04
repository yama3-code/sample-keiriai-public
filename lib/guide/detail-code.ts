// 「くわしく読む：コードを読む」で使う、実際のコードの抜粋（行頭の字下げだけをそろえている）。
// 実装を変えたら、抜粋の行も合わせて直す。tests/guide-detail.test.mjs で、各行が実装に含まれることを確かめている。
export type CodeReading = { id: string; title: string; path: string; heading: string; lines: { code: string; explanation: string }[] };

export const codeReadings: CodeReading[] = [
  {
    "id": "balance",
    "title": "例1：行ごとの貸借一致",
    "path": "lib/journal.ts",
    "heading": "例1：行ごとの貸借一致（チェック係）",
    "lines": [
      {
        "code": "const unbalanced = entries.filter((e) => e.debit_amount !== e.credit_amount);",
        "explanation": "仕訳の一覧（entries）から、借方金額と貸方金額が「同じではない」行だけを残し、unbalanced（合わない行）という名前で覚えておく。"
      },
      {
        "code": "checks.push({",
        "explanation": "チェック結果の一覧に、1つ付け足す。中身は次の3行。"
      },
      {
        "code": "  ok: unbalanced.length === 0,",
        "explanation": "合わない行の数が0なら OK、そうでなければ NG。"
      },
      {
        "code": "  label: \"行ごとの貸借一致\",",
        "explanation": "画面に出す項目名は「行ごとの貸借一致」。"
      },
      {
        "code": "  detail: unbalanced.length ? `不一致：${unbalanced.map((e) => e.voucher_no).join(\"、\")}` : undefined,",
        "explanation": "合わない行があれば、その伝票番号を「、」でつないで「不一致：TR-T-1204」のように表示する。なければ何も出さない。"
      },
      {
        "code": "});",
        "explanation": "付け足すものの終わり。"
      }
    ]
  },
  {
    "id": "date",
    "title": "例2：日付の形式",
    "path": "lib/journal.ts",
    "heading": "例2：日付の形式（チェック係）",
    "lines": [
      {
        "code": "const badDates = entries.filter((e) => {",
        "explanation": "仕訳の一覧から、日付がおかしい行だけを残す。1行ずつ、次の2つを調べる。"
      },
      {
        "code": "  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(e.date)) return true;",
        "explanation": "「数字4桁-2桁-2桁」の形でなければ、おかしい行とする。"
      },
      {
        "code": "  const parsed = new Date(`${e.date}T00:00:00.000Z`);",
        "explanation": "その日付を、暦（カレンダー）に当てはめてみる。"
      },
      {
        "code": "  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== e.date;",
        "explanation": "暦に当てはめられないか、当てはめて文字に戻したときに元の日付と違えば、おかしい行とする（2025-02-30は3月2日に変わってしまうのでNG）。"
      },
      {
        "code": "});",
        "explanation": "調べる作業の終わり。"
      },
      {
        "code": "checks.push({",
        "explanation": "チェック結果の一覧に、1つ付け足す。"
      },
      {
        "code": "  ok: badDates.length === 0,",
        "explanation": "おかしい行の数が0なら OK。"
      },
      {
        "code": "  label: \"日付の形式\",",
        "explanation": "画面に出す項目名は「日付の形式」。"
      },
      {
        "code": "  detail: badDates.length ? `不正：${badDates.map((e) => e.voucher_no).join(\"、\")}` : undefined,",
        "explanation": "おかしい行があれば、その伝票番号を「不正：〜」と表示する。"
      },
      {
        "code": "});",
        "explanation": "付け足すものの終わり。"
      }
    ]
  },
  {
    "id": "masters",
    "title": "例3：マスタをチェック係用の一覧に変える",
    "path": "lib/masters.ts",
    "heading": "例3：マスタを、チェック係用の一覧に変える",
    "lines": [
      {
        "code": "export function masterChecks(masters: MasterData[]) {",
        "explanation": "「保存済みのマスタ一式」を受け取って、チェック係用の一覧を作る作業に masterChecks という名前を付ける。"
      },
      {
        "code": "  const accounts = masters.find((m) => m.kind === \"accounts\");",
        "explanation": "マスタ一式から、用途が「勘定科目表」のものを探す。"
      },
      {
        "code": "  const departments = masters.find((m) => m.kind === \"departments\");",
        "explanation": "同じく、用途が「部門マスタ」のものを探す。"
      },
      {
        "code": "  const accountRows = accounts ? masterRows(accounts.content) : [];",
        "explanation": "勘定科目表があれば表の形（行と列）に読み込む。なければ空の表にする（削除したマスタを初期値で補わない）。"
      },
      {
        "code": "  const deptRows = departments ? masterRows(departments.content) : [];",
        "explanation": "部門マスタも同じように読み込む。"
      },
      {
        "code": "  return {",
        "explanation": "次の2つを結果として返す。"
      },
      {
        "code": "    accountCodes: new Map(accountRows.slice(1).map((r) => [r[accountRows[0].indexOf(\"科目コード\")], r[accountRows[0].indexOf(\"科目名\")]])),",
        "explanation": "見出し行を除いた各行から、「科目コード」列と「科目名」列を取り出し、コード→名前の対応表を作る。"
      },
      {
        "code": "    departmentNames: new Set(deptRows.slice(1).map((r) => r[deptRows[0].indexOf(\"部門名\")])),",
        "explanation": "見出し行を除いた各行から、「部門名」列を取り出し、部門名の一覧を作る。"
      },
      {
        "code": "  };",
        "explanation": "返すものの終わり。"
      },
      {
        "code": "}",
        "explanation": "作業の終わり。"
      }
    ]
  },
  {
    "id": "nudge",
    "title": "例4：提出を一度だけ催促する",
    "path": "app/api/run/route.ts",
    "heading": "例4：提出を一度だけ催促する（受付）",
    "lines": [
      {
        "code": "if (final.stop_reason === \"end_turn\" && !state.nudged) {",
        "explanation": "AIが「話を終えた」のに、まだ催促していなければ、次の4行を行う。"
      },
      {
        "code": "  state.nudged = true;",
        "explanation": "「催促した」という印を付ける（次からはこの部分を通らない）。"
      },
      {
        "code": "  state.messages.push(assistantTurn);",
        "explanation": "AIの返事を、会話の記録に付け足す。"
      },
      {
        "code": "  state.messages.push({ role: \"user\", content: \"作業が終わっていれば、submit_result ツールで結果を提出してください。\" });",
        "explanation": "あなたの代わりに「作業が終わっていれば、提出してください」という一言を、会話の記録に付け足す。"
      },
      {
        "code": "  continue;",
        "explanation": "AIとのやり取りを、もう1往復続ける。"
      },
      {
        "code": "}",
        "explanation": "条件の終わり。"
      }
    ]
  }
];
