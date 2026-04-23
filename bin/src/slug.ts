/**
 * slug 生成・検証ユーティリティ。
 *
 * rfc-init / spec-init で用いる日付プレフィクス付き slug の生成と
 * ケバブケース英数字バリデーションを提供する。
 */

/**
 * slug 最大文字数（slugstr 部分のみ）。
 */
export const MAX_SLUGSTR_LENGTH = 30;

/**
 * slugstr のバリデーション結果。
 */
export interface SlugValidationResult {
  ok: boolean;
  /** NG 時のエラーメッセージ */
  message?: string;
}

/**
 * slugstr（ユーザ入力）を検証する。
 *
 * 条件:
 *  - 30 文字以下
 *  - ケバブケース英数字（`^[a-z0-9]+(-[a-z0-9]+)*$`）
 *
 * @param slugstr ユーザ入力 slug 部分
 */
export function validateSlugstr(slugstr: string): SlugValidationResult {
  if (slugstr.length === 0) {
    return { ok: false, message: "slugstr が空です。" };
  }
  if (slugstr.length > MAX_SLUGSTR_LENGTH) {
    return {
      ok: false,
      message: `slugstr が${MAX_SLUGSTR_LENGTH}文字を超えています (${slugstr.length}文字)`,
    };
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugstr)) {
    return {
      ok: false,
      message:
        "slugstr はケバブケース英数字のみ使用可能です (例: my-feature-name)",
    };
  }
  return { ok: true };
}

/**
 * JST（Asia/Tokyo）の YYYYMMDD 文字列を返す。
 *
 * Windows 環境でも TZ 環境変数依存にならないよう、
 * `Intl.DateTimeFormat` で日本時刻を算出する。
 *
 * @param now 現在時刻（テスト用に差し替え可）
 */
export function jstDateString(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "00";
  const d = parts.find((p) => p.type === "day")?.value ?? "00";
  return `${y}${m}${d}`;
}

/**
 * 日付プレフィクス付き slug（`YYYYMMDD-xxxxxx`）から日付部を除去する。
 *
 * 日付プレフィクスが無い場合は入力をそのまま返す。
 * @param slug 完全 slug
 */
export function stripDatePrefix(slug: string): string {
  return slug.replace(/^\d{8}-/, "");
}

/**
 * slug が日付プレフィクス形式かどうかを返す。
 */
export function hasDatePrefix(slug: string): boolean {
  return /^\d{8}-/.test(slug);
}
