/**
 * Claude Code 規約のパス参照を Copilot 規約のパス参照へ書き換える。
 *
 * Copilot 向けに配布する指示書・ルール・ワークフロー本文中の
 * `.claude/...` 参照を `.github/...` 参照に置換するためのユーティリティ。
 *
 * 置換規則:
 *  - `.claude/workflow/` → `.github/workflow/`
 *  - `.claude/rules/<name>.md` → `.github/instructions/<name>.instructions.md`
 *  - `.claude/rules/` → `.github/instructions/`
 *  - `.claude/commands/<name>.md` → `.github/prompts/<name>.prompt.md`
 *  - `.claude/commands/` → `.github/prompts/`
 *
 * 他のサブディレクトリ（`prompts/`, `templates/`, `monitors/`, `skills/`）は
 * Copilot 側に自然な対応先が無いため書き換えずそのまま残す。配布後の対象
 * リポジトリには Claude 資産一式（`.claude/`）が配置されるため、Copilot
 * エージェントもそれらのパスを Read で辿って参照できる。
 */

/**
 * 本文中の `.claude/...` 参照を `.github/...` 参照へ置換する。
 *
 * ファイル参照（ファイル名の拡張子変換を伴うもの）を先に処理し、
 * ディレクトリ参照（末尾スラッシュ・拡張子変換不要のもの）を後で処理する。
 *
 * @param body 置換対象の本文
 * @returns パス参照を書き換えた本文
 */
export function rewriteClaudePaths(body: string): string {
  return body
    .replace(
      /\.claude\/rules\/([A-Za-z0-9_-]+)\.md\b/g,
      ".github/instructions/$1.instructions.md",
    )
    .replace(
      /\.claude\/commands\/([A-Za-z0-9_-]+)\.md\b/g,
      ".github/prompts/$1.prompt.md",
    )
    .replaceAll(".claude/workflow/", ".github/workflow/")
    .replaceAll(".claude/rules/", ".github/instructions/")
    .replaceAll(".claude/commands/", ".github/prompts/");
}

/**
 * Copilot 側 instructions ファイル用の frontmatter を付与する。
 *
 * `applyTo: "**"` を指定することで、対象リポジトリ全ファイル横断の
 * 行動原則として常時適用される。Claude Code 側で `.claude/rules/` が
 * 常時ロードされるのと等価な挙動を再現する狙い。
 *
 * @param body frontmatter を付与する本文
 * @returns frontmatter 付きの本文
 */
export function withInstructionsFrontmatter(body: string): string {
  const header = [
    "---",
    'applyTo: "**"',
    "---",
    "",
    "",
  ].join("\n");
  return header + body;
}
