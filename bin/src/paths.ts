/**
 * aidd リポジトリルートとサブパス解決ユーティリティ。
 *
 * Windows のドライブ文字を含むパスと POSIX 環境の双方で動作させるため、
 * Node.js の `path` と `url` を使用し手動の文字列操作を避ける。
 */
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * このモジュールが存在するディレクトリを基準に aidd リポジトリルートを解決する。
 *
 * 配布後は `bin/dist/paths.js` に展開されているため、2階層上がリポジトリルート。
 * @returns aidd リポジトリの絶対パス
 */
export function getAiddRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // bin/dist から見て ../.. がリポジトリルート
  return path.resolve(here, "..", "..");
}

/**
 * aidd ルートからの相対サブパスを絶対パスに変換する。
 * @param segments サブパスのセグメント列
 */
export function aiddPath(...segments: string[]): string {
  return path.join(getAiddRoot(), ...segments);
}
