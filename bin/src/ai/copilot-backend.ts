/**
 * GitHub Copilot CLI をヘッドレスで呼び出すバックエンド実装。
 *
 * Copilot CLI の標準的なエージェント実行サブコマンド
 * （`gh copilot`・`copilot` など環境によって異なる）に対し、
 * 等価なプロンプトを送出し応答を収集する。
 *
 * 実コマンド名は環境変数 `COPILOT_CLI` で上書き可能とする。既定は `copilot`。
 */
import type {
  AiBackend,
  BackendRunParams,
  BackendRunResult,
} from "./backend.js";
import { runWithStdin } from "./spawn-util.js";

/**
 * Copilot バックエンド。
 */
export class CopilotBackend implements AiBackend {
  readonly kind = "copilot";

  /**
   * Copilot CLI を起動し応答を収集する。
   * @param params プロンプト・許可ツール・タイムアウト
   */
  async run(params: BackendRunParams): Promise<BackendRunResult> {
    const command = process.env.COPILOT_CLI ?? "copilot";
    const args = this.buildArgs(params);
    return runWithStdin({
      command,
      args,
      stdin: params.prompt,
      timeoutSec: params.timeoutSec,
    });
  }

  /**
   * テスト用: 実際に起動するコマンドラインを構築する。
   *
   * Copilot CLI のヘッドレスモード（`--no-color -p`）相当の引数を組み立てる。
   * allowedTools は Copilot の `--allow-tool` に 1 ツール 1 引数で展開する。
   * @param params 実行パラメータ
   */
  buildArgs(params: BackendRunParams): string[] {
    const args: string[] = ["-p", "--no-color"];
    if (params.allowedTools && params.allowedTools.length > 0) {
      for (const t of params.allowedTools) {
        args.push("--allow-tool", t);
      }
    }
    return args;
  }
}
