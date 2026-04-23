#!/usr/bin/env node
/**
 * rfc-publish エントリーポイント。
 *
 * 使用方法:
 *   rfc-publish <slug>
 *
 * `rfc/<slug>` ブランチでの実行を前提に、RFC の初回コミット・プッシュ・
 * Draft PR 作成を行う。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { repoRoot } from "./git/utils.js";

/**
 * 現在チェックアウト中のブランチ名を取得する。
 */
function currentBranch(cwd: string): string | null {
  const r = spawnSync("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  return (r.stdout ?? "").trim();
}

/**
 * rfc-publish のメイン処理。
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length !== 1) {
    console.error("Usage: rfc-publish <slug>");
    process.exit(1);
  }
  const slug = argv[0];
  const target = repoRoot();

  const expected = `rfc/${slug}`;
  const current = currentBranch(target);
  if (current !== expected) {
    console.error(
      `エラー: 現在のブランチは ${current ?? "(取得不能)"} です。${expected} で実行してください。`,
    );
    process.exit(1);
  }

  const rfcRel = path.join("docs", "rfcs", slug, "rfc.md");
  const rfcAbs = path.join(target, rfcRel);
  try {
    await fs.access(rfcAbs);
  } catch {
    console.error(`エラー: ${rfcRel} が見つかりません。`);
    process.exit(1);
  }

  // コミット & プッシュ
  const add = spawnSync("git", ["add", rfcAbs], { cwd: target, stdio: "inherit" });
  if (add.status !== 0) {
    console.error("エラー: git add に失敗しました。");
    process.exit(1);
  }
  const commit = spawnSync(
    "git",
    ["commit", "-m", `docs: add RFC draft for ${slug}`],
    { cwd: target, stdio: "inherit" },
  );
  if (commit.status !== 0) {
    console.error("エラー: git commit に失敗しました。");
    process.exit(1);
  }
  const push = spawnSync("git", ["push", "-u", "origin", expected], {
    cwd: target,
    stdio: "inherit",
  });
  if (push.status !== 0) {
    console.error("エラー: git push に失敗しました。");
    process.exit(1);
  }

  // Draft PR 作成（既存確認）
  const prCheck = spawnSync("gh", ["pr", "view", expected], {
    cwd: target,
    encoding: "utf8",
  });
  if (prCheck.status === 0) {
    console.log("PR は既に存在します。スキップします。");
  } else {
    const body = [
      "## RFC Draft",
      "",
      `- **RFC**: \`${rfcRel}\``,
      `- **Branch**: \`${expected}\``,
      "",
      "---",
      "このPRはAIレビュー完了後に Ready 状態になります。",
    ].join("\n");
    const pr = spawnSync(
      "gh",
      [
        "pr",
        "create",
        "--draft",
        "--title",
        `[RFC] ${slug}`,
        "--body",
        body,
      ],
      { cwd: target, stdio: "inherit" },
    );
    if (pr.status !== 0) {
      console.error("エラー: gh pr create に失敗しました。");
      process.exit(1);
    }
    console.log("Draft PR を作成しました。");
  }

  console.log(`完了: ${rfcRel} を ${expected} にプッシュしました。`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`エラー: ${msg}`);
  process.exit(1);
});
