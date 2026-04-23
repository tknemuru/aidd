/**
 * AI バックエンド抽象インタフェース。
 *
 * Claude / Copilot どちらのバックエンドもこの契約を実装することで、
 * 呼び出し側はバックエンドの具体を意識せずに 1 問 1 答のヘッドレス実行を行える。
 */

/**
 * バックエンド実行時のパラメータ。
 */
export interface BackendRunParams {
  /** バックエンドに送出するプロンプト本文 */
  prompt: string;
  /** 許可ツール名の配列（バックエンド側で解釈可能な形式に正規化される） */
  allowedTools?: string[];
  /** タイムアウト秒数。0 以下は無期限を意味する */
  timeoutSec: number;
}

/**
 * バックエンド実行結果。
 */
export interface BackendRunResult {
  /** 実行プロセスの標準出力 */
  stdout: string;
  /** 実行プロセスの標準エラー */
  stderr: string;
  /** プロセス終了コード。タイムアウトやシグナル終了時は負値となる可能性がある */
  exitCode: number;
}

/**
 * AI バックエンド共通インタフェース。
 *
 * 呼び出し側はヘッドレスで 1 問 1 答を行うために `run` を呼び出す。
 * 例外はプロセス起動失敗など純粋な I/O 障害時のみ送出され、
 * プロンプト処理の失敗は `exitCode` として返される。
 */
export interface AiBackend {
  /** バックエンドの種別識別子（診断用） */
  readonly kind: string;
  /**
   * ヘッドレスで 1 問 1 答を行う。
   * @param params プロンプト・許可ツール・タイムアウト
   */
  run(params: BackendRunParams): Promise<BackendRunResult>;
}

/**
 * 環境変数 `AI_BACKEND` に基づき適切なバックエンド実装を解決する。
 *
 * 未設定時は `claude` を既定とする。未対応値に対しては即時例外を送出し、
 * フォールバック等の延命は行わない（RFC の設計意図に従う）。
 *
 * このモジュールは抽象定義のみを持つため、実装は lazy import で解決する。
 *
 * @param env 環境変数マップ（省略時は `process.env`）
 */
export async function resolveBackend(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AiBackend> {
  const kind = env.AI_BACKEND ?? "claude";
  switch (kind) {
    case "claude": {
      const mod = await import("./claude-backend.js");
      return new mod.ClaudeBackend();
    }
    case "copilot": {
      const mod = await import("./copilot-backend.js");
      return new mod.CopilotBackend();
    }
    default:
      throw new Error(`未対応の AI_BACKEND: ${kind}`);
  }
}
