/**
 * spawn-util のタイムアウト挙動を検証する。
 *
 * Linux/Windows 双方で利用可能な `node -e 'setTimeout(...)'` を擬似長時間処理として起動し、
 * タイムアウト到達時に exitCode が負値となることを確認する。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { runWithStdin } from "../dist/ai/spawn-util.js";

test("runWithStdin: タイムアウト超過で exitCode が負値となる", async () => {
  const res = await runWithStdin({
    command: process.execPath,
    args: ["-e", "setTimeout(() => {}, 60000)"],
    stdin: "",
    timeoutSec: 1,
  });
  assert.ok(res.exitCode < 0, `exitCode=${res.exitCode} が負値でない`);
});

test("runWithStdin: stdin をプロセスに渡せる", async () => {
  const res = await runWithStdin({
    command: process.execPath,
    args: [
      "-e",
      "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(d.toUpperCase()));",
    ],
    stdin: "hello",
    timeoutSec: 30,
  });
  assert.equal(res.exitCode, 0);
  assert.equal(res.stdout, "HELLO");
});
