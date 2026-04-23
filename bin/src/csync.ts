#!/usr/bin/env node
/**
 * csync コマンドエントリーポイント。
 *
 * aidd リポジトリの配布資産を対象リポジトリの `.claude/` および
 * `.github/prompts/` に同期する。
 *
 * 処理概要:
 *  1. Claude 向け資産（adapters/claude/）を対象の .claude/ へコピー
 *  2. 中立プロンプト（adapters/commands/）を Claude 形式で .claude/commands/ に配置
 *  3. 中立プロンプトを Copilot 形式に変換して .github/prompts/ に配置
 *  4. CLAUDE.md を対象リポジトリのルート直下へコピー
 *
 * Windows ネイティブでも動作するよう外部コマンド（rsync 等）には依存しない。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { aiddPath } from "./paths.js";
import { copyDir, dirExists } from "./csync/fs-util.js";
import { toCopilotPrompt } from "./csync/convert.js";
import { repoRoot } from "./git/utils.js";

/**
 * csync のメイン処理。
 */
async function main(): Promise<void> {
  const aiddRoot = aiddPath();
  const targetRoot = repoRoot();

  // aidd 自身に対する同期はブートストラップ用途として許可する。
  // 旧実装ではシンボリックリンク上書きを防ぐためガードしていたが、
  // 本リビジョンでは実体ディレクトリ運用のため不要となった。

  const claudeSrc = path.join(aiddRoot, "adapters", "claude");
  const commandsSrc = path.join(aiddRoot, "adapters", "commands");
  const dstClaudeDir = path.join(targetRoot, ".claude");
  const dstCommandsDir = path.join(dstClaudeDir, "commands");
  const dstCopilotDir = path.join(targetRoot, ".github", "prompts");

  if (!(await dirExists(claudeSrc))) {
    console.error(`エラー: 同期元が存在しません: ${claudeSrc}`);
    process.exit(1);
  }
  if (!(await dirExists(commandsSrc))) {
    console.error(`エラー: 中立プロンプトが存在しません: ${commandsSrc}`);
    process.exit(1);
  }

  console.log(`同期元 (Claude 資産): ${claudeSrc}`);
  console.log(`同期元 (中立プロンプト): ${commandsSrc}`);
  console.log(`同期先: ${targetRoot}`);
  console.log("");

  // 1. Claude 向け資産を .claude/ へコピー（CLAUDE.md と settings.local.json を除く）
  await copyDir(claudeSrc, dstClaudeDir, (rel) => {
    return rel === "CLAUDE.md" || rel === "settings.local.json";
  });

  // 2. 中立プロンプトを Claude 形式で .claude/commands/ に配置（無加工コピー）
  await fs.mkdir(dstCommandsDir, { recursive: true });
  const neutralEntries = await fs.readdir(commandsSrc, { withFileTypes: true });
  for (const entry of neutralEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const src = path.join(commandsSrc, entry.name);
    const dst = path.join(dstCommandsDir, entry.name);
    await fs.copyFile(src, dst);
  }

  // 3. 中立プロンプトを Copilot 形式に変換して .github/prompts/ に配置
  await fs.mkdir(dstCopilotDir, { recursive: true });
  for (const entry of neutralEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const src = path.join(commandsSrc, entry.name);
    const body = await fs.readFile(src, "utf8");
    // 変換に失敗した場合（未登録ツール名検出等）は例外伝播して配布を中断する。
    const converted = toCopilotPrompt(body, entry.name);
    const base = entry.name.replace(/\.md$/, "");
    const dst = path.join(dstCopilotDir, `${base}.prompt.md`);
    await fs.writeFile(dst, converted, "utf8");
  }

  // 4. CLAUDE.md をルート直下へコピー
  const claudeMdSrc = path.join(claudeSrc, "CLAUDE.md");
  const claudeMdDst = path.join(targetRoot, "CLAUDE.md");
  await fs.copyFile(claudeMdSrc, claudeMdDst);

  console.log("");
  console.log(`完了: 配布資産を ${targetRoot} に同期しました。`);
  console.log(`  - Claude 資産: ${dstClaudeDir}`);
  console.log(`  - Copilot プロンプト: ${dstCopilotDir}`);
  console.log(`  - プロジェクト指示書: ${claudeMdDst}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`エラー: ${msg}`);
  process.exit(1);
});
