/**
 * 自動開発オーケストレーションの決定ログ記録。
 *
 * `adev-decisions.md` に行を追記する軽量ユーティリティ。
 * 初回呼び出し時にヘッダーを生成する。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 決定ログエントリ。
 */
export interface DecisionEntry {
  /** RFC slug */
  slug: string;
  /** フェーズ名 */
  phase: string;
  /** アクション名 */
  action: string;
  /** 結果 */
  result: string;
  /** 備考 */
  note?: string;
}

/**
 * JST ISO8601 タイムスタンプ（`YYYY-MM-DDTHH:MM+0900` 相当）を返す。
 */
function jstTimestamp(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const h = get("hour") === "24" ? "00" : get("hour");
  const mi = get("minute");
  return `${y}-${mo}-${d}T${h}:${mi}+0900`;
}

/**
 * 決定ログ記録ヘルパ。
 */
export class DecisionLog {
  private initialized = false;
  constructor(private readonly logPath: string) {}

  /**
   * ログファイルが未作成なら Markdown テーブルヘッダーを書き出す。
   */
  private async ensureHeader(): Promise<void> {
    if (this.initialized) return;
    try {
      await fs.access(this.logPath);
      this.initialized = true;
      return;
    } catch {
      // 新規作成
    }
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    const header = [
      "# 自動開発 決定ログ",
      "",
      "| タイムスタンプ | RFC slug | フェーズ | アクション | 結果 | 備考 |",
      "|---------------|----------|---------|-----------|------|------|",
      "",
    ].join("\n");
    await fs.writeFile(this.logPath, header, "utf8");
    this.initialized = true;
  }

  /**
   * 1 件のエントリを追記する。
   */
  async record(entry: DecisionEntry): Promise<void> {
    await this.ensureHeader();
    const ts = jstTimestamp();
    const row = `| ${ts} | ${entry.slug} | ${entry.phase} | ${entry.action} | ${entry.result} | ${entry.note ?? "-"} |\n`;
    await fs.appendFile(this.logPath, row, "utf8");
  }
}
