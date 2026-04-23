/**
 * 自動開発オーケストレーションのフェーズ種別と判定ロジック。
 *
 * 旧 bash 実装 `adev.sh` の `phase_to_ordinal` / `detect_current_phase` の
 * TypeScript 版。判定順序・条件は旧実装と等価に維持する。
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { getPrStatus, remoteBranchExists } from "../git/utils.js";

/**
 * ライフサイクルフェーズ種別。
 */
export type Phase =
  | "RFC"
  | "RRFC"
  | "MERGE_RFC"
  | "IMP"
  | "RIMP"
  | "VFY"
  | "MERGE_IMPL"
  | "DONE";

/**
 * フェーズの順序序数。未知値は既定 0（RFC）を返す。
 * @param p フェーズ文字列
 */
export function phaseToOrdinal(p: string): number {
  switch (p) {
    case "RFC":
      return 0;
    case "RRFC":
      return 1;
    case "MERGE_RFC":
      return 2;
    case "IMP":
      return 3;
    case "RIMP":
      return 4;
    case "VFY":
      return 5;
    case "MERGE_IMPL":
      return 6;
    case "DONE":
      return 7;
    default:
      return 0;
  }
}

/**
 * detect_current_phase の依存抽象化。テスト差し替え用。
 */
export interface PhaseDetectionDeps {
  /** リポジトリルートの絶対パス */
  repoRoot: string;
  /** PR 状態取得関数 */
  getPrStatus: (branch: string) => "MERGED" | "OPEN" | "NONE";
  /** リモートブランチ参照存在確認関数 */
  remoteBranchExists: (branch: string) => boolean;
  /** ディレクトリ内ファイル一覧取得関数 */
  listDirEntries: (dir: string) => Promise<string[]>;
  /** ファイル本文取得関数 */
  readFileText: (file: string) => Promise<string>;
}

/**
 * `docs/rfcs/<slug>/review-*-r*.md` 群から最新ファイルを探して PASS 判定結果を返す。
 * ファイルが無い場合は null を返す。
 */
async function checkLatestReviewPassed(
  deps: PhaseDetectionDeps,
  slug: string,
  prefix: string,
): Promise<boolean | null> {
  const dir = path.join(deps.repoRoot, "docs", "rfcs", slug);
  let entries: string[];
  try {
    entries = await deps.listDirEntries(dir);
  } catch {
    return null;
  }
  const re = new RegExp(`^${prefix}-r(\\d+)\\.md$`);
  const candidates = entries
    .map((name) => {
      const m = re.exec(name);
      return m ? { name, r: parseInt(m[1], 10) } : null;
    })
    .filter((x): x is { name: string; r: number } => x !== null)
    .sort((a, b) => a.r - b.r);
  if (candidates.length === 0) return null;
  const latest = candidates[candidates.length - 1];
  const body = await deps.readFileText(path.join(dir, latest.name));
  return /最終判定.*PASS/.test(body);
}

/**
 * 成果物の実状態から現在フェーズを判定する。
 *
 * 判定順序:
 *  1. feature/<slug> の PR が MERGED → DONE
 *  2. review-vfy の最新が PASS → MERGE_IMPL
 *  3. review-impl の最新が PASS → VFY
 *  4. feature/<slug> ブランチまたは PR が存在 → RIMP
 *  5. rfc/<slug> の PR が MERGED → IMP
 *  6. review-gate の最新が PASS → MERGE_RFC
 *  7. rfc/<slug> ブランチまたは PR が存在 → RRFC
 *  8. いずれにも該当しない → RFC
 *
 * @param slug 完全 slug（日付プレフィクス付き）
 * @param deps 依存注入
 */
export async function detectCurrentPhase(
  slug: string,
  deps: PhaseDetectionDeps,
): Promise<Phase> {
  const featurePr = deps.getPrStatus(`feature/${slug}`);
  if (featurePr === "MERGED") return "DONE";

  const vfyPass = await checkLatestReviewPassed(deps, slug, "review-vfy");
  if (vfyPass === true) return "MERGE_IMPL";

  const implPass = await checkLatestReviewPassed(deps, slug, "review-impl");
  if (implPass === true) return "VFY";

  if (deps.remoteBranchExists(`feature/${slug}`)) return "RIMP";
  if (featurePr === "OPEN") return "RIMP";

  const rfcPr = deps.getPrStatus(`rfc/${slug}`);
  if (rfcPr === "MERGED") return "IMP";

  const gatePass = await checkLatestReviewPassed(deps, slug, "review-gate");
  if (gatePass === true) return "MERGE_RFC";

  if (deps.remoteBranchExists(`rfc/${slug}`)) return "RRFC";
  if (rfcPr === "OPEN") return "RRFC";

  return "RFC";
}

/**
 * デフォルト依存集合を構築する。実行時用。
 */
export function makeDefaultDeps(repoRootPath: string): PhaseDetectionDeps {
  return {
    repoRoot: repoRootPath,
    getPrStatus: (branch: string) => getPrStatus(branch, repoRootPath),
    remoteBranchExists: (branch: string) =>
      remoteBranchExists(branch, repoRootPath),
    listDirEntries: async (dir: string) => {
      try {
        return await fs.readdir(dir);
      } catch {
        return [];
      }
    },
    readFileText: async (file: string) => fs.readFile(file, "utf8"),
  };
}
