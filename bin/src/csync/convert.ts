/**
 * 中立プロンプト（Claude 形式で書かれたスラッシュコマンド本文）を
 * Copilot 向けプロンプトフォーマット（`.github/prompts/*.prompt.md`）へ変換する。
 *
 * frontmatter の付与と、本文に明示記載されたツール名集合の検証を行う。
 * 検証では `Claude Tool 名` の列挙（例: `--allowedTools "Bash Edit Read ..."`）を
 * 検出した場合にのみ、tool-map の完全性を検査する。
 * 未登録ツール名が検出された場合は例外を送出し、配布を中断する。
 */
import { TOOL_MAP, isKnownTool } from "./tool-map.js";

/**
 * プロンプト本文からツール名列挙箇所を抽出する。
 *
 * 代表的な記載パターン:
 *   --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch"
 *   --allowedTools "Bash Edit Read Write"
 *
 * 上記に一致する箇所が無い場合は空配列を返す。
 * @param body プロンプト本文
 */
export function extractAllowedToolsLists(body: string): string[][] {
  const results: string[][] = [];
  const re = /--allowedTools\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const list = m[1]
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (list.length > 0) results.push(list);
  }
  return results;
}

/**
 * 変換エラー。未登録ツール名を検出した場合に送出される。
 */
export class UnknownToolError extends Error {
  constructor(public readonly toolName: string, public readonly source?: string) {
    super(
      `未登録の Claude ツール名 '${toolName}' を検出。tool-map への登録が必要。` +
        (source ? ` (at ${source})` : ""),
    );
    this.name = "UnknownToolError";
  }
}

/**
 * Claude 形式のプロンプト本文を検証し、Copilot 形式へ変換する。
 *
 * 変換内容:
 *  1. Copilot 向け frontmatter（mode: agent）を先頭に付与
 *  2. 本文に `--allowedTools "..."` 記載がある場合、
 *     登場ツール名を tool-map で検証（未登録は例外）
 *  3. Claude 特有のプロセス起動フラグ（`claude -p`）に関する記述は本文に残す
 *     （Copilot 側では参考情報として扱う）
 *
 * @param src Claude 形式プロンプト本文
 * @param source ファイル名等の診断識別子（エラーメッセージに付与）
 * @returns Copilot 形式のプロンプト本文
 */
export function toCopilotPrompt(src: string, source?: string): string {
  // ツール参照の検証
  const lists = extractAllowedToolsLists(src);
  for (const list of lists) {
    for (const name of list) {
      if (!isKnownTool(name)) {
        throw new UnknownToolError(name, source);
      }
    }
  }

  const header = [
    "---",
    "mode: agent",
    "description: aidd slash command (copilot)",
    "---",
    "",
  ].join("\n");
  return header + src;
}

/**
 * Claude 配布向けのコピーは無加工パススルー。
 * 将来的な変換差異を許容するためインタフェースを明示的に分離しておく。
 */
export function toClaudePrompt(src: string): string {
  return src;
}

/**
 * tool-map の再エクスポート。利用側で型補完可能にするため。
 */
export { TOOL_MAP };
