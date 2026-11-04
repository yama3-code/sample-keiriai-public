import Agent from "@/components/Agent";
import { Suspense } from "react";
import { connection } from "next/server";
import { loadConfiguration } from "@/lib/configuration";
import { loadUsagePolicy } from "@/lib/usage-policy";

export default function Home() {
  return <Suspense fallback={<main style={{ padding: 32 }}>業務の内容を読み込んでいます…</main>}><CurrentAgent /></Suspense>;
}
async function CurrentAgent() {
  // 保存した内容を、画面を開いた時点で読み込む。
  await connection();
  let configuration;
  let policy;
  try { configuration = await loadConfiguration(); policy = loadUsagePolicy(); }
  catch { return <main style={{ padding: 32 }}><h1>業務の内容を読み込めませんでした</h1><p>保存先の設定や接続を確認して、画面を再読み込みしてください。</p></main>; }
  return <Agent tasks={configuration.tasks} sharedData={configuration.sharedData} configurationVersion={configuration.version} configurationUpdatedAt={configuration.updatedAt}
    models={policy.models} efforts={policy.efforts} defaultModel={policy.defaultModel} defaultEffort={policy.defaultEffort} usageNotice={policy.notice} />;
}
