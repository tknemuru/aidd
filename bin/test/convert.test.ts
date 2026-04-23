/**
 * プロンプト変換（Claude → Copilot）のテスト。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toCopilotPrompt,
  UnknownToolError,
  extractAllowedToolsLists,
} from "../dist/csync/convert.js";

test("toCopilotPrompt: frontmatter を付与し本文を保持する", () => {
  const src = "# /example\n\n本文。";
  const out = toCopilotPrompt(src, "example.md");
  assert.ok(out.startsWith("---\nmode: agent"));
  assert.ok(out.includes("# /example"));
  assert.ok(out.includes("本文。"));
});

test("toCopilotPrompt: 登録済みツール名列挙は通過する", () => {
  const src = [
    "# cmd",
    "",
    "Some prose",
    `  --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch"`,
    "",
  ].join("\n");
  const out = toCopilotPrompt(src);
  assert.ok(out.includes("# cmd"));
});

test("toCopilotPrompt: 未登録ツール名で UnknownToolError を送出", () => {
  const src = `--allowedTools "Bash Foo"`;
  assert.throws(
    () => toCopilotPrompt(src, "x.md"),
    (err: unknown): boolean => {
      if (!(err instanceof UnknownToolError)) return false;
      return err.toolName === "Foo" && /x\.md/.test(err.message);
    },
  );
});

test("extractAllowedToolsLists: 複数記載箇所をすべて抽出", () => {
  const src = [
    `--allowedTools "Bash Read"`,
    `--allowedTools "Edit Write"`,
  ].join("\n");
  const lists = extractAllowedToolsLists(src);
  assert.equal(lists.length, 2);
  assert.deepEqual(lists[0], ["Bash", "Read"]);
  assert.deepEqual(lists[1], ["Edit", "Write"]);
});

test("extractAllowedToolsLists: 記載なしで空配列", () => {
  const lists = extractAllowedToolsLists("プロンプト本文のみ");
  assert.deepEqual(lists, []);
});
