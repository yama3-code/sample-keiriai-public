// 手順書やCSVで使う改行・タブは残し、表示できない制御文字だけを拒否する。
export function hasUnsupportedControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
      || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}
