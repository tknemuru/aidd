/**
 * Claude → Copilot パス書換ユーティリティのテスト。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rewriteClaudePaths,
  withInstructionsFrontmatter,
} from "../dist/csync/path-rewrite.js";

test("rewriteClaudePaths: workflow ディレクトリ参照を書き換える", () => {
  const src = "詳細は `.claude/workflow/rfc-driven.md` を参照。";
  const out = rewriteClaudePaths(src);
  assert.ok(out.includes(".github/workflow/rfc-driven.md"));
  assert.ok(!out.includes(".claude/workflow/"));
});

test("rewriteClaudePaths: rules ディレクトリ参照を書き換える", () => {
  const src = "行動原則は `.claude/rules/` に定義されている。";
  const out = rewriteClaudePaths(src);
  assert.ok(out.includes(".github/instructions/"));
  assert.ok(!out.includes(".claude/rules/"));
});

test("rewriteClaudePaths: rules ファイル参照は .instructions.md に変換される", () => {
  const src = "`.claude/rules/testing-policy.md` に従う。";
  const out = rewriteClaudePaths(src);
  assert.ok(out.includes(".github/instructions/testing-policy.instructions.md"));
  assert.ok(!out.includes(".claude/rules/"));
});

test("rewriteClaudePaths: commands ファイル参照は .prompt.md に変換される", () => {
  const src = "コマンド定義: .claude/commands/rfc.md";
  const out = rewriteClaudePaths(src);
  assert.ok(out.includes(".github/prompts/rfc.prompt.md"));
  assert.ok(!out.includes(".claude/commands/"));
});

test("rewriteClaudePaths: commands ディレクトリ参照を書き換える", () => {
  const src = "コマンドは `.claude/commands/` に置く。";
  const out = rewriteClaudePaths(src);
  assert.ok(out.includes(".github/prompts/"));
  assert.ok(!out.includes(".claude/commands/"));
});

test("rewriteClaudePaths: 対応先のないサブディレクトリは書き換えない", () => {
  const src = [
    "`.claude/prompts/roles/rfc-author.md`",
    "`.claude/templates/service-spec/service-spec.md`",
    "`.claude/monitors/adev.md`",
    "`.claude/skills/foo.md`",
  ].join("\n");
  const out = rewriteClaudePaths(src);
  assert.ok(out.includes(".claude/prompts/roles/rfc-author.md"));
  assert.ok(out.includes(".claude/templates/service-spec/service-spec.md"));
  assert.ok(out.includes(".claude/monitors/adev.md"));
  assert.ok(out.includes(".claude/skills/foo.md"));
});

test("rewriteClaudePaths: 同一文書の複数箇所を一括書き換える", () => {
  const src = [
    "開発ライフサイクルの全体像は `.claude/workflow/rfc-driven.md` に定義。",
    "行動原則は `.claude/rules/` に配置。",
  ].join("\n");
  const out = rewriteClaudePaths(src);
  assert.ok(out.includes(".github/workflow/rfc-driven.md"));
  assert.ok(out.includes(".github/instructions/"));
  assert.ok(!out.includes(".claude/"));
});

test("withInstructionsFrontmatter: applyTo:** の frontmatter を付与する", () => {
  const out = withInstructionsFrontmatter("本文");
  assert.ok(out.startsWith("---\n"));
  assert.ok(out.includes('applyTo: "**"'));
  assert.ok(out.includes("本文"));
  const firstBreak = out.indexOf("---\n\n");
  assert.ok(firstBreak > 0, "frontmatter 終端 '---' と本文の間に空行があること");
});
