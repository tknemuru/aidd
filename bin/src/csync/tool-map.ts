/**
 * Claude 系ツール名と Copilot 側表記のマッピング。
 *
 * Claude Code のスラッシュコマンド定義で参照されるツール名のうち、
 * 配布時に Copilot 形式へ変換する対象の一覧をここで固定する。
 * 未登録のツール名が検出された場合は例外で中断し、配布を行わない。
 */

/**
 * Claude ツール名から Copilot の `#tool:` 記法表記へのマップ。
 *
 * Copilot 側の正準名は `.github/copilot-instructions.md` 等で共有され得る。
 * ここでは GitHub Copilot の公開済みビルトインツール名に揃える。
 */
export const TOOL_MAP: Readonly<Record<string, string>> = Object.freeze({
  Bash: "runCommands",
  Read: "codebase",
  Edit: "editFiles",
  Write: "editFiles",
  Glob: "search",
  Grep: "search",
  WebFetch: "fetch",
  WebSearch: "web",
  Task: "runCommands",
  Skill: "runCommands",
  NotebookEdit: "editFiles",
});

/**
 * Claude ツール名を Copilot 表記に変換する。
 * @param name Claude 側ツール名
 * @returns Copilot 側 `#tool:` 記法の body
 * @throws 未登録ツール名に対しては例外を送出する
 */
export function mapToolName(name: string): string {
  const mapped = TOOL_MAP[name];
  if (!mapped) {
    throw new Error(`未登録の Claude ツール名: ${name}`);
  }
  return mapped;
}

/**
 * ツール名が登録されているかを返す。
 */
export function isKnownTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_MAP, name);
}
