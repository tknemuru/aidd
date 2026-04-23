/**
 * フェーズ判定ロジックのテスト。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectCurrentPhase,
  phaseToOrdinal,
} from "../dist/adev/phase.js";
import type { PhaseDetectionDeps } from "../dist/adev/phase.js";

/**
 * テスト用依存を組み立てる。
 */
function makeDeps(overrides: Partial<PhaseDetectionDeps> = {}): PhaseDetectionDeps {
  return {
    repoRoot: "/tmp",
    getPrStatus: () => "NONE",
    remoteBranchExists: () => false,
    listDirEntries: async () => [],
    readFileText: async () => "",
    ...overrides,
  };
}

test("phaseToOrdinal: 全 8 フェーズが正しい序数を返す", () => {
  assert.equal(phaseToOrdinal("RFC"), 0);
  assert.equal(phaseToOrdinal("RRFC"), 1);
  assert.equal(phaseToOrdinal("MERGE_RFC"), 2);
  assert.equal(phaseToOrdinal("IMP"), 3);
  assert.equal(phaseToOrdinal("RIMP"), 4);
  assert.equal(phaseToOrdinal("VFY"), 5);
  assert.equal(phaseToOrdinal("MERGE_IMPL"), 6);
  assert.equal(phaseToOrdinal("DONE"), 7);
});

test("phaseToOrdinal: 未知値と空文字で 0 を返す", () => {
  assert.equal(phaseToOrdinal("UNKNOWN"), 0);
  assert.equal(phaseToOrdinal(""), 0);
});

test("detectCurrentPhase: feature PR MERGED で DONE", async () => {
  const p = await detectCurrentPhase("slug1", makeDeps({
    getPrStatus: (b: string) => (b.startsWith("feature/") ? "MERGED" : "NONE"),
  }));
  assert.equal(p, "DONE");
});

test("detectCurrentPhase: review-vfy PASS で MERGE_IMPL", async () => {
  const p = await detectCurrentPhase("slug2", makeDeps({
    listDirEntries: async () => ["review-vfy-r1.md"],
    readFileText: async () => "最終判定: PASS",
  }));
  assert.equal(p, "MERGE_IMPL");
});

test("detectCurrentPhase: review-impl PASS で VFY", async () => {
  const p = await detectCurrentPhase("slug3", makeDeps({
    listDirEntries: async () => ["review-impl-r1.md"],
    readFileText: async () => "最終判定: PASS",
  }));
  assert.equal(p, "VFY");
});

test("detectCurrentPhase: feature ブランチ存在で RIMP", async () => {
  const p = await detectCurrentPhase("slug4", makeDeps({
    remoteBranchExists: (b: string) => b === "feature/slug4",
  }));
  assert.equal(p, "RIMP");
});

test("detectCurrentPhase: feature OPEN PR で RIMP", async () => {
  const p = await detectCurrentPhase("slug4b", makeDeps({
    getPrStatus: (b: string) => (b === "feature/slug4b" ? "OPEN" : "NONE"),
  }));
  assert.equal(p, "RIMP");
});

test("detectCurrentPhase: rfc PR MERGED で IMP", async () => {
  const p = await detectCurrentPhase("slug5", makeDeps({
    getPrStatus: (b: string) => (b === "rfc/slug5" ? "MERGED" : "NONE"),
  }));
  assert.equal(p, "IMP");
});

test("detectCurrentPhase: review-gate PASS で MERGE_RFC", async () => {
  const p = await detectCurrentPhase("slug6", makeDeps({
    listDirEntries: async () => ["review-gate-r1.md"],
    readFileText: async () => "最終判定: PASS",
  }));
  assert.equal(p, "MERGE_RFC");
});

test("detectCurrentPhase: rfc ブランチ存在で RRFC", async () => {
  const p = await detectCurrentPhase("slug7", makeDeps({
    remoteBranchExists: (b: string) => b === "rfc/slug7",
  }));
  assert.equal(p, "RRFC");
});

test("detectCurrentPhase: 成果物無しで RFC", async () => {
  const p = await detectCurrentPhase("slug8", makeDeps());
  assert.equal(p, "RFC");
});

test("detectCurrentPhase: 最新ラウンド（r10 > r2）を選択", async () => {
  const p = await detectCurrentPhase("slug9", makeDeps({
    listDirEntries: async () => ["review-impl-r2.md", "review-impl-r10.md"],
    readFileText: async (f: string) => {
      // r10 は PASS、r2 は FAIL（最新優先で PASS 判定）
      if (f.endsWith("review-impl-r10.md")) return "最終判定: PASS";
      return "最終判定: FAIL";
    },
  }));
  assert.equal(p, "VFY");
});
