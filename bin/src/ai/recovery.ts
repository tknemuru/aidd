/**
 * リカバリループ・タイムアウト・エスカレーション検出の共通ラッパ。
 *
 * `git-utils.sh` の `run_claude_with_recovery` の TypeScript 版。
 * 最大 3 試行で再試行し、ESCALATION_REQUIRED マーカー検出時は
 * 終了コード 2 で即時終了する。
 */
import type { AiBackend } from "./backend.js";

/**
 * リカバリラッパ実行時のオプション。
 */
export interface RecoveryOptions {
  /** 許可ツール名の配列 */
  allowedTools: string[];
  /** 1 試行あたりのタイムアウト秒数 */
  timeoutSec: number;
  /** 最大試行回数。既定は 3 */
  maxAttempts?: number;
  /** 診断ログ出力先（省略時は stderr） */
  log?: (msg: string) => void;
}

/**
 * リカバリラッパの結果種別。
 */
export type RecoveryStatus = "ok" | "escalation" | "exhausted";

/**
 * リカバリラッパの戻り値。
 */
export interface RecoveryResult {
  /** 実行結果種別 */
  status: RecoveryStatus;
  /** 最終試行の標準出力 */
  stdout: string;
  /** 最終試行の標準エラー */
  stderr: string;
  /** 実施済み試行回数 */
  attempts: number;
}

/**
 * エスカレーションマーカー文字列。
 */
export const ESCALATION_MARKER = "ESCALATION_REQUIRED";

/**
 * 修復プロンプトを構築する。前回のエラー本文と元プロンプトを含める。
 * @param original 元のプロンプト
 * @param prevError 前回試行の標準エラー
 */
export function buildRecoveryPrompt(
  original: string,
  prevError: string,
): string {
  return [
    "前回の実行が以下のエラーで失敗した。",
    "エラー内容を分析し、問題を調査・修復した上で、",
    "元のタスクを完遂せよ。",
    "",
    "--- エラー出力 ---",
    prevError,
    "",
    "--- 元のプロンプト ---",
    original,
    "",
  ].join("\n");
}

/**
 * バックエンドに対しリカバリループ付きで 1 問 1 答を試行する。
 *
 * - 初回成功 (exitCode 0) で成功として返す
 * - 失敗時は最大 maxAttempts 回まで修復プロンプトで再試行
 * - 任意の試行で stdout に ESCALATION_REQUIRED を検出したら即時 escalation
 * - 全試行失敗で exhausted
 *
 * @param backend AI バックエンド
 * @param prompt 元プロンプト本文
 * @param opts 許可ツール・タイムアウト・最大試行
 */
export async function runWithRecovery(
  backend: AiBackend,
  prompt: string,
  opts: RecoveryOptions,
): Promise<RecoveryResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const log = opts.log ?? ((m: string) => process.stderr.write(`${m}\n`));
  let lastStdout = "";
  let lastStderr = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(`[${backend.kind}] 試行 ${attempt}/${maxAttempts}`);
    const currentPrompt =
      attempt === 1 ? prompt : buildRecoveryPrompt(prompt, lastStderr);
    const res = await backend.run({
      prompt: currentPrompt,
      allowedTools: opts.allowedTools,
      timeoutSec: opts.timeoutSec,
    });
    lastStdout = res.stdout;
    lastStderr = res.stderr;

    if (res.stdout.includes(ESCALATION_MARKER)) {
      log(`[${backend.kind}] エスカレーション検出`);
      return {
        status: "escalation",
        stdout: res.stdout,
        stderr: res.stderr,
        attempts: attempt,
      };
    }

    if (res.exitCode === 0) {
      return {
        status: "ok",
        stdout: res.stdout,
        stderr: res.stderr,
        attempts: attempt,
      };
    }

    log(`[${backend.kind}] 試行 ${attempt} 失敗 (exitCode=${res.exitCode})`);
  }

  log(`[${backend.kind}] 最大試行回数(${maxAttempts})に到達`);
  return {
    status: "exhausted",
    stdout: lastStdout,
    stderr: lastStderr,
    attempts: maxAttempts,
  };
}
