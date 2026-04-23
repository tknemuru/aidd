/**
 * Git / gh CLI を薄く包む同期ユーティリティ。
 *
 * シェル実装の `git-utils.sh` の TypeScript 版に相当する。
 * 子プロセス起動は `node:child_process` の `spawnSync` を用い、
 * Windows/Linux で差異のあるシェル解釈を避けるため shell: false で実行する。
 */
import { spawnSync } from "node:child_process";

/**
 * コマンドを同期起動し標準出力の trim 済み文字列を返す。
 * 失敗時は `null` を返す（呼び出し側でフォールバック可能にするため）。
 */
function runCapture(cmd: string, args: string[], cwd?: string): string | null {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (r.status !== 0) return null;
  return (r.stdout ?? "").trim();
}

/**
 * 現在のリポジトリのルートディレクトリ（Git ワーキングツリー）を取得する。
 *
 * Windows のドライブ文字を含むパスもそのまま返す。
 * Git 外で呼ばれた場合は例外を送出する。
 */
export function repoRoot(cwd?: string): string {
  const out = runCapture("git", ["rev-parse", "--show-toplevel"], cwd);
  if (!out) throw new Error("gitリポジトリ内で実行してください。");
  return out;
}

/**
 * リモート `origin` のデフォルトブランチ名を返す。取得不可時は `main` / `master` の順でフォールバック。
 */
export function getDefaultBranch(cwd?: string): string {
  const out = runCapture("git", ["remote", "show", "origin"], cwd);
  if (out) {
    const m = out.match(/HEAD branch:\s*(\S+)/);
    if (m && m[1] && m[1] !== "(unknown)") return m[1];
  }
  const mainExists = runCapture(
    "git",
    ["show-ref", "--verify", "--quiet", "refs/heads/main"],
    cwd,
  );
  if (mainExists !== null) return "main";
  const masterExists = runCapture(
    "git",
    ["show-ref", "--verify", "--quiet", "refs/heads/master"],
    cwd,
  );
  if (masterExists !== null) return "master";
  return "main";
}

/**
 * PR 状態種別。
 */
export type PrStatus = "MERGED" | "OPEN" | "NONE";

/**
 * 指定ブランチに対する PR の状態を `gh` 経由で取得する。
 * @param branch 対象ブランチ名
 */
export function getPrStatus(branch: string, cwd?: string): PrStatus {
  const merged = runCapture(
    "gh",
    [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "merged",
      "--json",
      "number",
      "--jq",
      ".[0].number",
    ],
    cwd,
  );
  if (merged && merged.length > 0) return "MERGED";
  const open = runCapture(
    "gh",
    [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--json",
      "number",
      "--jq",
      ".[0].number",
    ],
    cwd,
  );
  if (open && open.length > 0) return "OPEN";
  return "NONE";
}

/**
 * ローカルに指定リモートブランチ参照が存在するかを返す。
 */
export function remoteBranchExists(branch: string, cwd?: string): boolean {
  const r = spawnSync(
    "git",
    [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/remotes/origin/${branch}`,
    ],
    { cwd, shell: false },
  );
  return r.status === 0;
}
