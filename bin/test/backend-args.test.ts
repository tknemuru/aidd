/**
 * Claude / Copilot バックエンドの引数組み立てテスト。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeBackend } from "../dist/ai/claude-backend.js";
import { CopilotBackend } from "../dist/ai/copilot-backend.js";

test("Claude バックエンドは -p と --allowedTools を組み立てる", () => {
  const b = new ClaudeBackend();
  const args = b.buildArgs({
    prompt: "x",
    allowedTools: ["Bash", "Read"],
    timeoutSec: 10,
  });
  assert.deepEqual(args, ["-p", "--allowedTools", "Bash Read"]);
});

test("Claude バックエンドは allowedTools 未指定時に -p のみ", () => {
  const b = new ClaudeBackend();
  const args = b.buildArgs({ prompt: "x", timeoutSec: 10 });
  assert.deepEqual(args, ["-p"]);
});

test("Copilot バックエンドは -p と --no-color と --allow-tool を 1 ツール毎に組み立てる", () => {
  const b = new CopilotBackend();
  const args = b.buildArgs({
    prompt: "x",
    allowedTools: ["Bash", "Read"],
    timeoutSec: 10,
  });
  assert.deepEqual(args, [
    "-p",
    "--no-color",
    "--allow-tool",
    "Bash",
    "--allow-tool",
    "Read",
  ]);
});

test("Copilot バックエンドは allowedTools 未指定時に -p --no-color のみ", () => {
  const b = new CopilotBackend();
  const args = b.buildArgs({ prompt: "x", timeoutSec: 10 });
  assert.deepEqual(args, ["-p", "--no-color"]);
});
