#!/usr/bin/env node
/**
 * adev 自動開発オーケストレータ（TypeScript 版）。
 *
 * 使用方法:
 *   adev <仕様書パス> <フェーズマップJSONファイル>
 *
 * フェーズマップ JSON を入力として、各 slug をフェーズに応じて
 * フラットに処理する。フェーズ判定はコマンド定義側（adev.md）で
 * 実施済みであり、本スクリプトは判定を行わない。ただし日付プレフィクスが
 * 無い入力については `detect_current_phase` で再判定を行い、
 * マップより進んでいる場合はスキップする。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { repoRoot, getDefaultBranch } from "./git/utils.js";
import { resolveBackend } from "./ai/backend.js";
import {
  runWithRecovery,
  type RecoveryResult,
} from "./ai/recovery.js";
import {
  detectCurrentPhase,
  makeDefaultDeps,
  phaseToOrdinal,
  type Phase,
} from "./adev/phase.js";
import { stripDatePrefix } from "./slug.js";
import {
  shouldEscalateGateFail,
  shouldEscalateVfy,
  shouldRequireMergeApproval,
  type RiskLevel,
} from "./adev/policy.js";
import { DecisionLog } from "./adev/decision-log.js";

/**
 * フェーズマップ JSON のスキーマ。
 */
interface PhaseMap {
  risk_level: RiskLevel;
  slugs: { slug: string; phase: Phase }[];
}

/**
 * 共通の許可ツール集合。
 */
const ALLOWED_TOOLS = [
  "Bash",
  "Edit",
  "Read",
  "Write",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
];

/**
 * 1 試行あたりのタイムアウト秒数。環境変数 `CLAUDE_TIMEOUT` で上書き可。
 */
const DEFAULT_TIMEOUT_SEC = parseInt(
  process.env.CLAUDE_TIMEOUT ?? "3600",
  10,
);

/**
 * AI バックエンドを 1 回呼び出し、リカバリ結果を標準出力へも書き出す。
 */
async function invoke(
  prompt: string,
  opts: { allowedTools?: string[]; timeoutSec?: number } = {},
): Promise<RecoveryResult> {
  const backend = await resolveBackend();
  const result = await runWithRecovery(backend, prompt, {
    allowedTools: opts.allowedTools ?? ALLOWED_TOOLS,
    timeoutSec: opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC,
  });
  process.stdout.write(result.stdout);
  return result;
}

/**
 * 共通エスカレーション指示ブロックを返す。
 */
function escalationBlock(): string {
  return [
    "",
    "エスカレーション指示:",
    "AI が自力で完遂できないタスクに遭遇した場合、",
    "以下の形式で標準出力に出力し、即座に処理を中断せよ。",
    "ダミー値設定・ステップスキップ・仮完了報告は禁止する。",
    "",
    "ESCALATION_REQUIRED",
    "ブロッカー: {内容}",
    "理由: {理由}",
    "推奨アクション: {アクション}",
    "再開条件: {条件}",
    "",
  ].join("\n");
}

/**
 * 最終行に PASS / FAIL いずれがあるかを判定する（末尾 5 行以内）。
 */
function tailHasPass(text: string): boolean {
  const tail = text.trimEnd().split("\n").slice(-5).join("\n");
  return /PASS/.test(tail);
}
function tailHasFail(text: string): boolean {
  const tail = text.trimEnd().split("\n").slice(-5).join("\n");
  return /FAIL/.test(tail);
}

/**
 * メイン処理。
 */
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error("Usage: adev <仕様書パス> <フェーズマップJSONファイル>");
    process.exit(1);
  }
  const specPath = argv[0];
  const phaseMapFile = argv[1];

  try {
    await fs.access(specPath);
  } catch {
    console.error(`エラー: 仕様書が見つかりません: ${specPath}`);
    process.exit(1);
  }
  let phaseMap: PhaseMap;
  try {
    const raw = await fs.readFile(phaseMapFile, "utf8");
    phaseMap = JSON.parse(raw) as PhaseMap;
  } catch (e) {
    console.error(
      `エラー: フェーズマップの読み込みに失敗しました: ${phaseMapFile}`,
    );
    throw e;
  }

  const riskLevel = phaseMap.risk_level;
  const slugs = phaseMap.slugs;
  const rootPath = repoRoot();
  const specDir = path.dirname(specPath);
  const decisionLog = new DecisionLog(path.join(specDir, "adev-decisions.md"));

  console.log("=== 自動開発オーケストレータ v3 (TypeScript) ===");
  console.log(`リスクレベル: ${riskLevel}`);
  console.log(`仕様書: ${specPath}`);

  for (const entry of slugs) {
    let slug = entry.slug;
    let phase: Phase = entry.phase;

    // 仕様書 slug（日付プレフィクスなし）を完全 slug に解決
    const directDir = path.join(rootPath, "docs", "rfcs", slug);
    const directExists = await fs
      .access(directDir)
      .then(() => true)
      .catch(() => false);
    if (!directExists) {
      const rfcsDir = path.join(rootPath, "docs", "rfcs");
      let dirs: string[] = [];
      try {
        dirs = await fs.readdir(rfcsDir);
      } catch {
        dirs = [];
      }
      const resolved = dirs.find((d) => d.endsWith(`-${entry.slug}`));
      if (resolved) slug = resolved;
    }

    // フェーズ再判定（slug が解決された場合）
    if (slug !== entry.slug) {
      const deps = makeDefaultDeps(rootPath);
      const actual = await detectCurrentPhase(slug, deps);
      if (phaseToOrdinal(actual) > phaseToOrdinal(phase)) {
        console.log(
          `[${slug}] フェーズ再判定: ${phase} → ${actual}（スキップ）`,
        );
        phase = actual;
      }
    }

    console.log("");
    console.log(`--- slug: ${slug}, phase: ${phase} ---`);

    if (phase === "DONE") {
      console.log(`[${slug}] DONE。スキップ。`);
      continue;
    }

    // RFC フェーズ
    if (phase === "RFC") {
      const slugstr = stripDatePrefix(slug);
      console.log(`[${slug}] rfc-init 実行中...`);
      const rfcInitPath = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "rfc-init.js",
      );
      const r = spawnSync(process.execPath, [rfcInitPath, slugstr], {
        cwd: rootPath,
        encoding: "utf8",
      });
      if (r.status !== 0) {
        await decisionLog.record({
          slug,
          phase: "RFC作成",
          action: "rfc-init",
          result: "失敗",
        });
        console.error(`エラー: [${slug}] rfc-init が失敗しました。停止します。`);
        if (r.stderr) process.stderr.write(r.stderr);
        process.exit(1);
      }
      slug = (r.stdout ?? "").trim();

      console.log(`[${slug}] /rfc 実行中...`);
      const specBody = await fs.readFile(specPath, "utf8");
      const prompt = [
        "以下のコマンド定義を読み込み、その手順に従ってRFCを作成せよ。",
        "- コマンド定義: .claude/commands/rfc.md",
        "",
        "$ARGUMENTS の値は以下の元ネタ文章として扱え:",
        specBody,
        "",
        `rfc-init は実行済みである。完全 slug は「${slug}」。`,
        "/rfc の Step 2（slugstr 生成）と Step 3（初期化）をスキップし、Step 4 から開始せよ。",
        escalationBlock(),
      ].join("\n");
      const res = await invoke(prompt);
      if (res.status === "escalation") {
        await decisionLog.record({
          slug,
          phase: "RFC作成",
          action: "/rfc 実行",
          result: "エスカレーション",
        });
        process.exit(2);
      }
      if (res.status !== "ok") {
        await decisionLog.record({
          slug,
          phase: "RFC作成",
          action: "/rfc 実行",
          result: "失敗",
        });
        console.error(`エラー: [${slug}] /rfc が失敗しました。停止します。`);
        process.exit(1);
      }
      await decisionLog.record({
        slug,
        phase: "RFC作成",
        action: "/rfc 実行",
        result: "成功",
      });
      phase = "RRFC";
    }

    // RRFC フェーズ
    if (phase === "RRFC") {
      console.log(`[${slug}] /rrfc レビューループ実行中...`);
      let passed = false;
      const maxAttempts = 8;
      let attempt = 0;
      while (!passed && attempt < maxAttempts) {
        attempt++;
        console.log(`[${slug}] レビューラウンド ${attempt}`);
        const prompt = [
          "以下のコマンド定義を読み込み、その手順に従ってRFCレビューを実行せよ。",
          "- コマンド定義: .claude/commands/rrfc.md",
          "",
          `$ARGUMENTS の値は「${slug}」として扱え。`,
          "",
          "最終行に PASS または FAIL とだけ出力せよ。",
          escalationBlock(),
        ].join("\n");
        const res = await invoke(prompt);
        if (res.status === "escalation") {
          await decisionLog.record({
            slug,
            phase: "RFCレビュー",
            action: "/rrfc 実行",
            result: "エスカレーション",
            note: `ラウンド${attempt}`,
          });
          process.exit(2);
        }
        if (tailHasPass(res.stdout) && !tailHasFail(res.stdout)) {
          passed = true;
          await decisionLog.record({
            slug,
            phase: "RFCレビュー",
            action: "/rrfc 実行",
            result: "PASS",
            note: `ラウンド${attempt}`,
          });
          break;
        }
        await decisionLog.record({
          slug,
          phase: "RFCレビュー",
          action: "/rrfc 実行",
          result: "FAIL",
          note: `ラウンド${attempt}`,
        });
        console.log(`[${slug}] /urfc 修正実行中...`);
        const fixPrompt = [
          "以下のコマンド定義を読み込み、その手順に従ってRFCを修正せよ。",
          "- コマンド定義: .claude/commands/urfc.md",
          "",
          `$ARGUMENTS の値は「${slug}」として扱え。`,
          escalationBlock(),
        ].join("\n");
        await invoke(fixPrompt);
        await decisionLog.record({
          slug,
          phase: "RFC修正",
          action: "/urfc 実行",
          result: "完了",
          note: `ラウンド${attempt}`,
        });
      }
      if (!passed) {
        console.error(
          `エラー: [${slug}] RFCレビューが ${maxAttempts} 回で PASS しませんでした。`,
        );
        process.exit(1);
      }
      phase = "MERGE_RFC";
    }

    // MERGE_RFC フェーズ
    if (phase === "MERGE_RFC") {
      console.log(`[${slug}] RFC PR マージ中...`);
      if (shouldRequireMergeApproval(riskLevel)) {
        process.stdout.write("ESCALATION_REQUIRED\n");
        process.stdout.write("ブロッカー: RFC PR マージに人間承認が必要\n");
        process.stdout.write("理由: リスクレベル高\n");
        process.stdout.write("推奨アクション: PR を確認しマージしてください\n");
        process.stdout.write("再開条件: PR がマージされていること\n");
        await decisionLog.record({
          slug,
          phase: "RFCマージ",
          action: "人間承認待ち",
          result: "エスカレーション",
          note: `リスク: ${riskLevel}`,
        });
        process.exit(2);
      }
      const defaultBranch = getDefaultBranch(rootPath);
      spawnSync("git", ["checkout", `rfc/${slug}`], {
        cwd: rootPath,
        stdio: "inherit",
      });
      const m = spawnSync("gh", ["pr", "merge", "--squash", "--delete-branch"], {
        cwd: rootPath,
        stdio: "inherit",
      });
      if (m.status !== 0) {
        await decisionLog.record({
          slug,
          phase: "RFCマージ",
          action: "gh pr merge",
          result: "失敗",
        });
        console.error(`エラー: [${slug}] RFC PR マージが失敗しました。`);
        process.exit(1);
      }
      await decisionLog.record({
        slug,
        phase: "RFCマージ",
        action: "gh pr merge",
        result: "成功",
      });
      spawnSync("git", ["checkout", defaultBranch], {
        cwd: rootPath,
        stdio: "inherit",
      });
      spawnSync("git", ["pull", "--ff-only", "origin", defaultBranch], {
        cwd: rootPath,
        stdio: "inherit",
      });
      phase = "IMP";
    }

    // IMP フェーズ
    if (phase === "IMP") {
      console.log(`[${slug}] /imp 実行中...`);
      const prompt = [
        "以下のコマンド定義を読み込み、その手順に従って実装を実行せよ。",
        "- コマンド定義: .claude/commands/imp.md",
        "",
        `$ARGUMENTS の値は「${slug}」として扱え。`,
        "",
        "注意: /vfy の副作用を伴う操作はユーザ承認済みとして扱え。",
        escalationBlock(),
      ].join("\n");
      const res = await invoke(prompt);
      if (res.status === "escalation") {
        await decisionLog.record({
          slug,
          phase: "実装",
          action: "/imp 実行",
          result: "エスカレーション",
        });
        process.exit(2);
      }
      if (res.status !== "ok") {
        await decisionLog.record({
          slug,
          phase: "実装",
          action: "/imp 実行",
          result: "失敗",
        });
        console.error(`エラー: [${slug}] /imp が失敗しました。`);
        process.exit(1);
      }
      await decisionLog.record({
        slug,
        phase: "実装",
        action: "/imp 実行",
        result: "成功",
      });
      phase = "RIMP";
    }

    // RIMP フェーズ
    if (phase === "RIMP") {
      console.log(`[${slug}] /rimp レビューループ実行中...`);
      let passed = false;
      const maxAttempts = 8;
      let attempt = 0;
      while (!passed && attempt < maxAttempts) {
        attempt++;
        console.log(`[${slug}] 実装レビューラウンド ${attempt}`);
        const prompt = [
          "以下のコマンド定義を読み込み、その手順に従って実装レビューを実行せよ。",
          "- コマンド定義: .claude/commands/rimp.md",
          "",
          `$ARGUMENTS の値は「${slug}」として扱え。`,
          "",
          "最終行に PASS または FAIL とだけ出力せよ。",
          escalationBlock(),
        ].join("\n");
        const res = await invoke(prompt);
        if (res.status === "escalation") {
          await decisionLog.record({
            slug,
            phase: "実装レビュー",
            action: "/rimp 実行",
            result: "エスカレーション",
            note: `ラウンド${attempt}`,
          });
          process.exit(2);
        }
        if (tailHasPass(res.stdout) && !tailHasFail(res.stdout)) {
          passed = true;
          await decisionLog.record({
            slug,
            phase: "実装レビュー",
            action: "/rimp 実行",
            result: "PASS",
            note: `ラウンド${attempt}`,
          });
          break;
        }
        await decisionLog.record({
          slug,
          phase: "実装レビュー",
          action: "/rimp 実行",
          result: "FAIL",
          note: `ラウンド${attempt}`,
        });

        // GATE FAIL エスカレーション
        for (const gate of ["GATE-I0", "GATE-I1", "GATE-I2"] as const) {
          if (res.stdout.includes(gate)) {
            if (shouldEscalateGateFail(riskLevel, gate)) {
              process.stdout.write("ESCALATION_REQUIRED\n");
              process.stdout.write(`ブロッカー: ${gate} FAIL でエスカレーション必要\n`);
              process.stdout.write(`理由: リスクレベル ${riskLevel}\n`);
              process.stdout.write("推奨アクション: レビュー結果を確認し対応してください\n");
              process.stdout.write("再開条件: 問題が解消されていること\n");
              await decisionLog.record({
                slug,
                phase: "実装レビュー",
                action: `${gate} FAIL`,
                result: "エスカレーション",
                note: `リスク: ${riskLevel}`,
              });
              process.exit(2);
            }
          }
        }

        console.log(`[${slug}] 実装修正実行中...`);
        const fixPrompt = [
          "実装レビューで FAIL が検出されました。",
          `docs/rfcs/${slug}/ 配下の最新のレビュー結果ファイルを Read で読み込み、`,
          "FAIL 項目を特定して修正せよ。",
          "修正後、変更をコミット・プッシュせよ。",
          escalationBlock(),
        ].join("\n");
        await invoke(fixPrompt);
      }
      if (!passed) {
        console.error(
          `エラー: [${slug}] 実装レビューが ${maxAttempts} 回で PASS しませんでした。`,
        );
        process.exit(1);
      }
      phase = "VFY";
    }

    // VFY フェーズ
    if (phase === "VFY") {
      console.log(`[${slug}] /vfy 検証実行中...`);
      const vfyPrompt = [
        "以下のコマンド定義を読み込み、その手順に従って検証を実行せよ。",
        "- コマンド定義: .claude/commands/vfy.md",
        "",
        `$ARGUMENTS の値は「${slug}」として扱え。`,
        "",
        "注意: 副作用を伴う操作はユーザ承認済みとして扱え。",
        "最終行に PASS または FAIL とだけ出力せよ。",
      ].join("\n");
      const vfyRes = await invoke(vfyPrompt);
      let vfyStatus: "PASS" | "FAIL" =
        tailHasFail(vfyRes.stdout) ? "FAIL" : "PASS";

      if (vfyStatus === "PASS") {
        console.log(`[${slug}] /rvfy Verification ゲートレビュー実行中...`);
        const rvfyPrompt = [
          "以下のコマンド定義を読み込み、",
          "その手順に従って Verification ゲートレビューを実行せよ。",
          "- コマンド定義: .claude/commands/rvfy.md",
          "",
          `$ARGUMENTS の値は「${slug}」として扱え。`,
          "",
          "最終行に PASS または FAIL とだけ出力せよ。",
        ].join("\n");
        const rvfyRes = await invoke(rvfyPrompt, {
          allowedTools: ["Bash", "Edit", "Read", "Write", "Glob", "Grep"],
        });
        if (tailHasFail(rvfyRes.stdout)) vfyStatus = "FAIL";
      }

      if (shouldEscalateVfy(riskLevel, vfyStatus)) {
        process.stdout.write("ESCALATION_REQUIRED\n");
        process.stdout.write(`ブロッカー: 検証結果(${vfyStatus})に対し人間確認が必要\n`);
        process.stdout.write(`理由: リスクレベル ${riskLevel}\n`);
        process.stdout.write("推奨アクション: 検証結果を確認してください\n");
        process.stdout.write("再開条件: 人間が確認・承認していること\n");
        await decisionLog.record({
          slug,
          phase: "検証",
          action: "/vfy 実行",
          result: "エスカレーション",
          note: `結果: ${vfyStatus}, リスク: ${riskLevel}`,
        });
        process.exit(2);
      }
      await decisionLog.record({
        slug,
        phase: "検証",
        action: "/vfy 実行",
        result: vfyStatus,
      });
      phase = "MERGE_IMPL";
    }

    // MERGE_IMPL フェーズ
    if (phase === "MERGE_IMPL") {
      console.log(`[${slug}] 実装 PR マージ中...`);
      if (shouldRequireMergeApproval(riskLevel)) {
        process.stdout.write("ESCALATION_REQUIRED\n");
        process.stdout.write("ブロッカー: 実装 PR マージに人間承認が必要\n");
        process.stdout.write("理由: リスクレベル高\n");
        process.stdout.write("推奨アクション: PR を確認しマージしてください\n");
        process.stdout.write("再開条件: PR がマージされていること\n");
        await decisionLog.record({
          slug,
          phase: "実装マージ",
          action: "人間承認待ち",
          result: "エスカレーション",
          note: `リスク: ${riskLevel}`,
        });
        process.exit(2);
      }
      const defaultBranch = getDefaultBranch(rootPath);
      spawnSync("git", ["checkout", `feature/${slug}`], {
        cwd: rootPath,
        stdio: "inherit",
      });
      const m = spawnSync("gh", ["pr", "merge", "--squash", "--delete-branch"], {
        cwd: rootPath,
        stdio: "inherit",
      });
      if (m.status !== 0) {
        await decisionLog.record({
          slug,
          phase: "実装マージ",
          action: "gh pr merge",
          result: "失敗",
        });
        console.error(`エラー: [${slug}] 実装 PR マージが失敗しました。`);
        process.exit(1);
      }
      await decisionLog.record({
        slug,
        phase: "実装マージ",
        action: "gh pr merge",
        result: "成功",
      });
      spawnSync("git", ["checkout", defaultBranch], {
        cwd: rootPath,
        stdio: "inherit",
      });
      spawnSync("git", ["pull", "--ff-only", "origin", defaultBranch], {
        cwd: rootPath,
        stdio: "inherit",
      });
    }

    console.log(`[${slug}] 完了。`);
  }

  const pendingCount = slugs.filter((s) => s.phase !== "DONE").length;
  if (pendingCount >= 2) {
    console.log("");
    console.log("=== 全体 E2E テスト ===");
    console.log("全RFC実装完了。仕様書 §2 に基づく全体E2Eテストを実行します。");
    const vfyPrompt = [
      "以下のコマンド定義を読み込み、その手順に従って検証を実行せよ。",
      "- コマンド定義: .claude/commands/vfy.md",
      "",
      `$ARGUMENTS の値は「${specPath}」として扱え。`,
      "",
      "注意: 副作用を伴う操作はユーザ承認済みとして扱え。",
      "最終行に PASS または FAIL とだけ出力せよ。",
    ].join("\n");
    await invoke(vfyPrompt);
  } else {
    console.log("");
    console.log("=== 単一 RFC のため全体 E2E テストをスキップ ===");
  }

  console.log("");
  console.log("=== 自動開発が完了しました ===");
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`エラー: ${msg}`);
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
