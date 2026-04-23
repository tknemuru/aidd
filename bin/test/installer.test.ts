/**
 * インストーラ（package.json の bin フィールド）のテスト。
 *
 * npm グローバルインストール時に、5 本の CLI 名がパス解決可能となることを
 * 構成レベルで保証する。実際の `npm install -g` 実行は環境副作用が大きいため、
 * ここでは bin フィールドの宣言が正しく、指定されたビルド成果物が存在することを確認する。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** このテストファイルから見た aidd ルート（bin/test → aidd ルート） */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("package.json の bin は 5 本の CLI を宣言する", async () => {
  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  );
  const expected = ["csync", "rfc-init", "rfc-publish", "spec-init", "adev"];
  assert.ok(pkg.bin, "bin フィールドが存在する");
  const actual = Object.keys(pkg.bin).sort();
  assert.deepEqual(actual, expected.sort());
});

test("package.json の bin が指す成果物はビルド後に存在する", async () => {
  const pkg = JSON.parse(
    await fs.readFile(path.join(ROOT, "package.json"), "utf8"),
  );
  for (const [name, rel] of Object.entries(pkg.bin as Record<string, string>)) {
    const abs = path.join(ROOT, rel);
    const exists = await fs
      .access(abs)
      .then(() => true)
      .catch(() => false);
    assert.ok(exists, `${name} のビルド成果物が存在する: ${rel}`);
  }
});
