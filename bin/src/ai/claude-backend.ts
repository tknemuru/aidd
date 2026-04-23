/**
 * Claude Code CLI をヘッドレスで呼び出すバックエンド実装。
 *
 * 既存の `claude -p` オプション互換で子プロセスを起動し、
 * プロンプト本文を stdin に流し込む。
 */
import type {
  AiBackend,
  BackendRunParams,
  BackendRunResult,
} from "./backend.js";
import { runWithStdin } from "./spawn-util.js";

/**
 * Claude バックエンド。
 *
 * 呼び出し時は `claude -p [--allowedTools "..."]` を起動する。
 */
export class ClaudeBackend implements AiBackend {
  readonly kind = "claude";

  /**
   * `claude -p` を起動し応答を収集する。
   * @param params プロンプト・許可ツール・タイムアウト
   */
  async run(params: BackendRunParams): Promise<BackendRunResult> {
    const args: string[] = ["-p"];
    if (params.allowedTools && params.allowedTools.length > 0) {
      args.push("--allowedTools", params.allowedTools.join(" "));
    }
    return runWithStdin({
      command: "claude",
      args,
      stdin: params.prompt,
      timeoutSec: params.timeoutSec,
    });
  }

  /**
   * テスト用: 実際に起動するコマンドラインを構築する。
   * @param params 実行パラメータ
   */
  buildArgs(params: BackendRunParams): string[] {
    const args: string[] = ["-p"];
    if (params.allowedTools && params.allowedTools.length > 0) {
      args.push("--allowedTools", params.allowedTools.join(" "));
    }
    return args;
  }
}
