/**
 * csync で用いるファイル/ディレクトリ同期ユーティリティ。
 *
 * rsync 等の外部依存を避け、Node.js 標準 API のみで
 * 再帰コピーと除外フィルタを実装する。Windows/Linux の双方で
 * 同一挙動となるよう `fs/promises` を使用する。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * コピー時の除外判定関数。`true` を返すとコピー対象から除外される。
 */
export type ExcludePredicate = (relativePath: string) => boolean;

/**
 * ディレクトリを再帰的にコピーする。
 *
 * @param srcDir コピー元ディレクトリ
 * @param dstDir コピー先ディレクトリ
 * @param exclude 除外判定関数（相対パス基準）。省略時は除外なし
 */
export async function copyDir(
  srcDir: string,
  dstDir: string,
  exclude?: ExcludePredicate,
): Promise<void> {
  await fs.mkdir(dstDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    const rel = entry.name;
    if (exclude && exclude(rel)) continue;
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath, (sub) => {
        const subRel = path.join(rel, sub);
        return exclude ? exclude(subRel) : false;
      });
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, dstPath);
    }
    // シンボリックリンク等は配布物に含めない（本 RFC のリンク廃止方針）。
  }
}

/**
 * ファイルが存在するかを返す。
 */
export async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile();
  } catch {
    return false;
  }
}

/**
 * ディレクトリが存在するかを返す。
 */
export async function dirExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}
