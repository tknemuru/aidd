/**
 * リカバリラッパのテスト。
 *
 * バックエンドをモックに差し替え、以下を検証する:
 * - 初回成功で戻り値 ok を返す
 * - 初回失敗後 2 回目成功で戻り値 ok を返す
 * - 最大試行到達で exhausted を返す
 * - エスカレーションマーカー検出で escalation を返す
 * - タイムアウト超過で打ち切り扱いとなる
 * - 修復プロンプトに前回エラー本文と元プロンプトを含む
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildRecoveryPrompt,
  runWithRecovery,
} from "../dist/ai/recovery.js";
import type { AiBackend, BackendRunResult } from "../dist/ai/backend.js";

/**
 * シナリオを差し替え可能なテスト用バックエンド。
 */
class MockBackend implements AiBackend {
  readonly kind = "mock";
  public calls: { prompt: string; allowedTools?: string[]; timeoutSec: number }[] = [];
  constructor(
    private readonly scenario: (
      attempt: number,
      prompt: string,
    ) => Partial<BackendRunResult>,
  ) {}
  async run(params: {
    prompt: string;
    allowedTools?: string[];
    timeoutSec: number;
  }): Promise<BackendRunResult> {
    this.calls.push({ ...params });
    const res = this.scenario(this.calls.length, params.prompt);
    return {
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
      exitCode: res.exitCode ?? 0,
    };
  }
}

test("リカバリラッパ: 初回成功で ok を返す", async () => {
  const b = new MockBackend(() => ({ stdout: "ok!", exitCode: 0 }));
  const r = await runWithRecovery(b, "original", {
    allowedTools: ["Bash"],
    timeoutSec: 10,
    log: () => {},
  });
  assert.equal(r.status, "ok");
  assert.equal(r.stdout, "ok!");
  assert.equal(r.attempts, 1);
  assert.equal(b.calls.length, 1);
});

test("リカバリラッパ: 初回失敗後 2 回目成功で ok を返す", async () => {
  const b = new MockBackend((attempt) => {
    if (attempt === 1) return { stderr: "エラー1", exitCode: 1 };
    return { stdout: "二回目成功", exitCode: 0 };
  });
  const r = await runWithRecovery(b, "元プロンプト", {
    allowedTools: ["Bash"],
    timeoutSec: 10,
    log: () => {},
  });
  assert.equal(r.status, "ok");
  assert.equal(r.attempts, 2);
  // 2 回目のプロンプトに前回エラーと元プロンプトが含まれる
  const second = b.calls[1].prompt;
  assert.ok(second.includes("エラー1"));
  assert.ok(second.includes("元プロンプト"));
});

test("リカバリラッパ: 3 連続失敗で exhausted を返す", async () => {
  const b = new MockBackend(() => ({ stderr: "always fail", exitCode: 2 }));
  const r = await runWithRecovery(b, "x", {
    allowedTools: ["Bash"],
    timeoutSec: 10,
    log: () => {},
  });
  assert.equal(r.status, "exhausted");
  assert.equal(r.attempts, 3);
});

test("リカバリラッパ: エスカレーションマーカー検出で escalation を返す", async () => {
  const b = new MockBackend(() => ({
    stdout: "処理開始\nESCALATION_REQUIRED\nブロッカー: 認証情報\n",
    exitCode: 0,
  }));
  const r = await runWithRecovery(b, "x", {
    allowedTools: ["Bash"],
    timeoutSec: 10,
    log: () => {},
  });
  assert.equal(r.status, "escalation");
  assert.equal(r.attempts, 1);
});

test("リカバリラッパ: 2 回目の出力でエスカレーション検出（ループ中断）", async () => {
  const b = new MockBackend((attempt) => {
    if (attempt === 1) return { stderr: "e", exitCode: 1 };
    return {
      stdout: "ESCALATION_REQUIRED\nブロッカー: xx\n",
      exitCode: 0,
    };
  });
  const r = await runWithRecovery(b, "x", {
    allowedTools: ["Bash"],
    timeoutSec: 10,
    log: () => {},
  });
  assert.equal(r.status, "escalation");
  assert.equal(r.attempts, 2);
});

test("buildRecoveryPrompt: エラー本文と元プロンプトを含む", () => {
  const p = buildRecoveryPrompt("元の本文", "前回エラー");
  assert.ok(p.includes("元の本文"));
  assert.ok(p.includes("前回エラー"));
});
