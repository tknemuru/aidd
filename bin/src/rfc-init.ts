#!/usr/bin/env node
/**
 * rfc-init エントリーポイント。
 *
 * 使用方法:
 *   rfc-init <slugstr>
 *
 * - JST 日付付き slug を生成し、
 * - `rfc/<slug>` ブランチを作成し、
 * - `docs/rfcs/<slug>/rfc.md` にテンプレートを配置し、
 * - 標準出力に完全 slug を出力する。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { aiddPath } from "./paths.js";
import { getDefaultBranch, repoRoot } from "./git/utils.js";
import { jstDateString, validateSlugstr } from "./slug.js";

/**
 * rfc-init のメイン処理。
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length !== 1) {
    console.error("Usage: rfc-init <slugstr>");
    console.error(
      "  slugstr: 最大30文字の全小文字ケバブケース英数字 (a-z, 0-9, ハイフン)",
    );
    process.exit(1);
  }
  const slugstr = argv[0];
  const v = validateSlugstr(slugstr);
  if (!v.ok) {
    console.error(`エラー: ${v.message}`);
    process.exit(1);
  }

  const target = repoRoot();

  // 日付付き slug を生成し重複時は連番付与。
  let slug = `${jstDateString()}-${slugstr}`;
  let targetDir = path.join(target, "docs", "rfcs", slug);
  try {
    await fs.access(targetDir);
    // 既存ディレクトリあり。連番を付与して衝突回避。
    let i = 2;
    while (true) {
      const candidate = path.join(target, "docs", "rfcs", `${slug}-${i}`);
      try {
        await fs.access(candidate);
        i++;
      } catch {
        slug = `${slug}-${i}`;
        targetDir = candidate;
        break;
      }
    }
  } catch {
    // 存在しない: そのまま使用
  }

  // 未コミット変更の検出
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: target,
    encoding: "utf8",
  });
  if ((status.stdout ?? "").trim().length > 0) {
    console.error(
      "エラー: 未コミットの変更があります。先にコミットまたは stash してください。",
    );
    process.exit(1);
  }

  // ブランチ作成
  const defaultBranch = getDefaultBranch(target);
  spawnSync("git", ["checkout", defaultBranch], { cwd: target, stdio: "inherit" });
  spawnSync("git", ["pull", "--ff-only", "origin", defaultBranch], {
    cwd: target,
    stdio: "inherit",
  });
  const branch = `rfc/${slug}`;
  const created = spawnSync("git", ["checkout", "-b", branch], {
    cwd: target,
    stdio: "inherit",
  });
  if (created.status !== 0) {
    const sw = spawnSync("git", ["checkout", branch], {
      cwd: target,
      stdio: "inherit",
    });
    if (sw.status !== 0) {
      console.error(`エラー: ブランチ ${branch} の作成/切替に失敗しました。`);
      process.exit(1);
    }
  }

  // ディレクトリ作成 & テンプレートコピー
  await fs.mkdir(targetDir, { recursive: true });
  const templatePath = path.join(
    aiddPath(),
    "adapters",
    "claude",
    "templates",
    "rfc",
    "rfc-default.md",
  );
  await fs.copyFile(templatePath, path.join(targetDir, "rfc.md"));

  // 標準出力に完全 slug を出力（呼び出し元がパース）
  process.stdout.write(`${slug}\n`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`エラー: ${msg}`);
  process.exit(1);
});
