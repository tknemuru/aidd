/**
 * リスクレベル分岐ポリシーのテスト。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldEscalateGateFail,
  shouldEscalateVfy,
  shouldRequireMergeApproval,
} from "../dist/adev/policy.js";

test("shouldEscalateGateFail: GATE-0/I0 は全リスクでエスカレーション", () => {
  for (const risk of ["high", "medium", "low"] as const) {
    assert.equal(shouldEscalateGateFail(risk, "GATE-0"), true);
    assert.equal(shouldEscalateGateFail(risk, "GATE-I0"), true);
  }
});

test("shouldEscalateGateFail: high/medium で GATE-5/2/I1/I2 はエスカレーション", () => {
  for (const risk of ["high", "medium"] as const) {
    for (const gate of ["GATE-5", "GATE-2", "GATE-I1", "GATE-I2"] as const) {
      assert.equal(shouldEscalateGateFail(risk, gate), true);
    }
  }
});

test("shouldEscalateGateFail: low では GATE-5/2/I1/I2 は非エスカレーション", () => {
  for (const gate of ["GATE-5", "GATE-2", "GATE-I1", "GATE-I2"] as const) {
    assert.equal(shouldEscalateGateFail("low", gate), false);
  }
});

test("shouldRequireMergeApproval: high のみ承認必要", () => {
  assert.equal(shouldRequireMergeApproval("high"), true);
  assert.equal(shouldRequireMergeApproval("medium"), false);
  assert.equal(shouldRequireMergeApproval("low"), false);
});

test("shouldEscalateVfy: high は常にエスカレーション", () => {
  assert.equal(shouldEscalateVfy("high", "PASS"), true);
  assert.equal(shouldEscalateVfy("high", "FAIL"), true);
});

test("shouldEscalateVfy: medium は FAIL のみエスカレーション", () => {
  assert.equal(shouldEscalateVfy("medium", "PASS"), false);
  assert.equal(shouldEscalateVfy("medium", "FAIL"), true);
});

test("shouldEscalateVfy: low は非エスカレーション", () => {
  assert.equal(shouldEscalateVfy("low", "PASS"), false);
  assert.equal(shouldEscalateVfy("low", "FAIL"), false);
});
