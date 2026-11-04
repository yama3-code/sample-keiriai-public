import type { RunEvent } from "@/app/api/run/route";

// 分割された日本語や、末尾に改行のない最後のイベントも読み取る。
// 完了通知なしで通信が終わった場合は、正常終了として扱わない。
export async function readRunStream(body: ReadableStream<Uint8Array>, onEvent: (event: RunEvent) => void, signal?: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = ""; let terminal = false; let complete = false;
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", onAbort, { once: true });
  function emit(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as RunEvent;
    if (!event || typeof event !== "object" || !["status", "note", "code", "code_result", "question", "result", "error"].includes(event.type)) {
      throw new Error("作業結果の通信形式が正しくありません");
    }
    if (terminal) throw new Error("完了後に予期しない通信が届きました");
    terminal = ["question", "result", "error"].includes(event.type);
    onEvent(event);
  }
  try {
    signal?.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) !== -1) {
        emit(buffer.slice(0, index)); buffer = buffer.slice(index + 1);
      }
    }
    buffer += decoder.decode(); emit(buffer);
    if (!terminal) throw new Error("作業結果を受け取る前に通信が終了しました");
    complete = true;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
