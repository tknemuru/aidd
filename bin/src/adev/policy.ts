/**
 * 自動開発オーケストレーションのリスクレベル分岐ポリシー。
 *
 * 旧 bash 実装の `should_escalate_gate_fail` / `should_require_merge_approval` /
 * `should_escalate_vfy` の TypeScript 版。挙動は旧実装と等価に維持する。
 */

/**
 * リスクレベル種別。
 */
export type RiskLevel = "high" | "medium" | "low";

/**
 * ゲート識別子。
 */
export type GateName =
  | "GATE-0"
  | "GATE-I0"
  | "GATE-1"
  | "GATE-2"
  | "GATE-5"
  | "GATE-I1"
  | "GATE-I2";

/**
 * ゲート FAIL 時のエスカレーション要否を返す。
 *
 * - GATE-0 / GATE-I0 は常時エスカレーション
 * - high/medium リスクでは GATE-5, GATE-2, GATE-I1, GATE-I2 もエスカレーション
 * - low リスクは上記以外では非エスカレーション
 */
export function shouldEscalateGateFail(
  risk: RiskLevel,
  gate: GateName,
): boolean {
  if (gate === "GATE-0" || gate === "GATE-I0") return true;
  if (risk === "high" || risk === "medium") {
    return (
      gate === "GATE-5" ||
      gate === "GATE-2" ||
      gate === "GATE-I1" ||
      gate === "GATE-I2"
    );
  }
  return false;
}

/**
 * PR マージ時の人間承認要否を返す。
 * - high: 承認必要
 * - それ以外: 自動マージ可
 */
export function shouldRequireMergeApproval(risk: RiskLevel): boolean {
  return risk === "high";
}

/**
 * 検証結果に対するエスカレーション要否を返す。
 * - high: 常にエスカレーション
 * - medium: FAIL のみエスカレーション
 * - low: 非エスカレーション
 */
export function shouldEscalateVfy(
  risk: RiskLevel,
  result: "PASS" | "FAIL",
): boolean {
  if (risk === "high") return true;
  if (risk === "medium" && result === "FAIL") return true;
  return false;
}
