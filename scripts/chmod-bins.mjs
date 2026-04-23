#!/usr/bin/env node
/**
 * ビルド後に 5 本の CLI エントリーポイントへ実行可能属性を付与する。
 * Windows では無効操作となるが、失敗しても致命ではないため握り潰す。
 */
import { chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const bins = ["csync", "rfc-init", "rfc-publish", "spec-init", "adev"];
const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, "..", "bin", "dist");
for (const name of bins) {
  try {
    chmodSync(path.join(distDir, `${name}.js`), 0o755);
  } catch {
    // Windows や権限不足環境では失敗し得るが致命ではない。
  }
}
