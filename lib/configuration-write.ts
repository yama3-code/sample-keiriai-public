import { ConfigurationError, saveConfiguration } from "@/lib/configuration";
import { isSameOrigin, limitRequestTraffic, limitTogether, randomId, readLimitedBody, requestAddress, securityErrorResponse } from "@/lib/security";
import { securityCommand } from "@/lib/security-store";

// 通常保存と復元は同じ保存ロックを使い、初期値・固定控えへの復旧だけを別枠にする。
export async function writeConfigurationRequest(request: Request, recovery: boolean) {
  if (!isSameOrigin(request)) return Response.json({ error: "送信元を確認できません" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    const address = requestAddress(request);
    await limitRequestTraffic(request, recovery ? "recovery" : "settings", address);
    const bytes = await readLimitedBody(request, 1024 * 1024);
    const input: unknown = await new Response(bytes).json().catch(() => null);
    const isRestore = typeof input === "object" && input !== null && !Array.isArray(input) && "target" in input && input.target === "restore";
    const protectedRecovery = isRestore && "historyId" in input && (input.historyId === "baseline" || input.historyId === "initial");
    // 専用の復元枠を、任意の手順やマスタを保存する抜け道にはしない。
    if (recovery !== isRestore) throw new ConfigurationError(recovery ? "この操作では保存済みの履歴・控え・初期値だけを復元できます。" : "復元は変更履歴の専用の操作から行ってください。");
    // 本文受信後にロックを取り、古い同一版の並列送信で枠を減らさせない。
    const owner = randomId();
    if (await securityCommand("lock", "settings:write", owner, 30_000) !== "OK") {
      throw new ConfigurationError("ほかの保存を処理しています。少し待ち、最新の内容を読み込んでから保存してください。", 409);
    }
    try {
      return Response.json(await saveConfiguration(input, () => {
        request.signal.throwIfAborted();
        const ordinaryRules = [
          { key: `settings:address:${address}`, count: 30, seconds: 3600 },
          { key: "settings:global", count: 60, seconds: 3600 },
        ];
        return limitTogether("accepted", protectedRecovery ? [
          { key: `recovery:address:${address}`, count: 5, seconds: 60 },
          { key: "recovery:global", count: 10, seconds: 60 },
          { key: `recovery-hour:address:${address}`, count: 10, seconds: 3600 },
          { key: "recovery-hour:global", count: 20, seconds: 3600 },
        ] : recovery ? [
          ...ordinaryRules,
          { key: `history-restore:address:${address}`, count: 5, seconds: 60 },
          { key: "history-restore:global", count: 10, seconds: 60 },
        ] : ordinaryRules, recovery ? "復元回数の上限に達しました。表示された待ち時間をおき、最新の内容を確認してください。" : undefined);
      }), { headers: { "Cache-Control": "no-store" } });
    } finally { await securityCommand("unlock", "settings:write", owner); }
  } catch (error) {
    if (error instanceof ConfigurationError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return securityErrorResponse(error);
  }
}
