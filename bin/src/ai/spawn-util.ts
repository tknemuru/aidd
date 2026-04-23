/**
 * 子プロセスをタイムアウト付きで起動し、標準入力にプロンプトを流し込み、
 * 標準出力・標準エラーを収集する共通実装。
 *
 * Windows/Linux 双方で再現可能な挙動となるよう `shell: false` で起動し、
 * パイプハング回避のため stdout/stderr を別ファイルにバッファリングする戦略は取らず、
 * Node の内部バッファを用いる（プロンプト単位の入出力想定のため問題にならない）。
 */
import { spawn } from "node:child_process";
import type { BackendRunResult } from "./backend.js";

/**
 * 子プロセス起動オプション。
 */
export interface SpawnPromptOptions {
  /** 実行コマンド（絶対パスまたは PATH 解決可能な名前） */
  command: string;
  /** コマンド引数 */
  args: string[];
  /** stdin に流し込むプロンプト本文 */
  stdin: string;
  /** タイムアウト秒数。0 以下は無期限 */
  timeoutSec: number;
  /** 追加の環境変数 */
  env?: NodeJS.ProcessEnv;
}

/**
 * 子プロセスをタイムアウト付きで実行し結果を返す。
 *
 * タイムアウト到達時は SIGTERM を送出し、戻り値の exitCode は負値となる。
 * @param opts 起動オプション
 */
export function runWithStdin(
  opts: SpawnPromptOptions,
): Promise<BackendRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(opts.command, opts.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env ?? {}) },
      shell: false,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => stdoutChunks.push(d));
    child.stderr.on("data", (d: Buffer) => stderrChunks.push(d));

    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutSec > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        // 猶予後に強制終了
        setTimeout(() => {
          if (!child.killed) child.kill("SIGKILL");
        }, 2000).unref();
      }, opts.timeoutSec * 1000);
      timer.unref();
    }

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      let exitCode: number;
      if (timedOut) {
        exitCode = -1;
      } else if (code !== null) {
        exitCode = code;
      } else if (signal !== null) {
        exitCode = -2;
      } else {
        exitCode = 0;
      }
      resolve({ stdout, stderr, exitCode });
    });

    // stdin へプロンプト書き込み
    child.stdin.on("error", () => {
      // stdin 書き込みエラーは子プロセスが停止した可能性。
      // close イベントで最終結果を返すためここでは何もしない。
    });
    child.stdin.end(opts.stdin);
  });
}
