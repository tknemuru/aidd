/**
 * AI バックエンド解決ロジックの単体テスト。
 *
 * - AI_BACKEND 環境変数ごとに正しいバックエンドを返すこと
 * - 未知値で即時例外となること
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBackend } from "../dist/ai/backend.js";

test("AI_BACKEND=claude で Claude バックエンドを返す", async () => {
  const backend = await resolveBackend({ AI_BACKEND: "claude" });
  assert.equal(backend.kind, "claude");
});

test("AI_BACKEND 未指定で既定の Claude バックエンドを返す", async () => {
  const backend = await resolveBackend({});
  assert.equal(backend.kind, "claude");
});

test("AI_BACKEND=copilot で Copilot バックエンドを返す", async () => {
  const backend = await resolveBackend({ AI_BACKEND: "copilot" });
  assert.equal(backend.kind, "copilot");
});

test("未知値 AI_BACKEND で即時例外となる", async () => {
  await assert.rejects(
    async () => resolveBackend({ AI_BACKEND: "gemini" }),
    (err: unknown) => {
      return err instanceof Error && /未対応の AI_BACKEND: gemini/.test(err.message);
    },
  );
});
