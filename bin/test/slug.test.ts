/**
 * slug 関連ユーティリティのテスト。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasDatePrefix,
  jstDateString,
  stripDatePrefix,
  validateSlugstr,
} from "../dist/slug.js";

test("validateSlugstr: 正常なケバブケースは通過", () => {
  assert.equal(validateSlugstr("my-feature-name").ok, true);
  assert.equal(validateSlugstr("x").ok, true);
  assert.equal(validateSlugstr("a1-b2").ok, true);
});

test("validateSlugstr: 空文字は拒否", () => {
  assert.equal(validateSlugstr("").ok, false);
});

test("validateSlugstr: 31 文字超は拒否", () => {
  assert.equal(validateSlugstr("a".repeat(31)).ok, false);
  assert.equal(validateSlugstr("a".repeat(30)).ok, true);
});

test("validateSlugstr: 大文字・アンダースコアを拒否", () => {
  assert.equal(validateSlugstr("My-Feature").ok, false);
  assert.equal(validateSlugstr("my_feature").ok, false);
});

test("stripDatePrefix: 日付付き slug から日付を除去", () => {
  assert.equal(stripDatePrefix("20260310-test-slug"), "test-slug");
});

test("stripDatePrefix: 日付なし slug はそのまま", () => {
  assert.equal(stripDatePrefix("test-slug"), "test-slug");
});

test("hasDatePrefix: 判定が正しい", () => {
  assert.equal(hasDatePrefix("20260310-x"), true);
  assert.equal(hasDatePrefix("x"), false);
});

test("jstDateString: YYYYMMDD 形式", () => {
  const s = jstDateString(new Date("2026-04-23T00:00:00Z"));
  // JST は UTC+9 なので 2026-04-23 09:00 JST
  assert.match(s, /^\d{8}$/);
  assert.equal(s, "20260423");
});
