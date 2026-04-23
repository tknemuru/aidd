#!/usr/bin/env bash
# git-utils.sh の単体テスト
#
# get_pr_status() と run_claude_with_recovery() の動作を検証する。
# 外部コマンド（gh, claude）はモック関数で置き換える。
#
# 使用方法:
#   bash tests/test_git_utils.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VDEV_HOME="$(cd "$SCRIPT_DIR/.." && pwd)"

# テスト結果カウンタ
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# テスト結果を記録するユーティリティ関数
#
# 引数:
#   $1: テスト名
#   $2: 期待値
#   $3: 実際の値
assert_equals() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$expected" = "$actual" ]; then
    echo "  PASS: ${test_name}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${test_name}"
    echo "    期待値: '${expected}'"
    echo "    実際値: '${actual}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# 終了コードを検証するユーティリティ関数
#
# 引数:
#   $1: テスト名
#   $2: 期待する終了コード
#   $3: 実際の終了コード
assert_exit_code() {
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  TESTS_RUN=$((TESTS_RUN + 1))

  if [ "$expected" = "$actual" ]; then
    echo "  PASS: ${test_name}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${test_name}"
    echo "    期待終了コード: ${expected}"
    echo "    実際終了コード: ${actual}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# 文字列が含まれることを検証するユーティリティ関数
#
# 引数:
#   $1: テスト名
#   $2: 期待される部分文字列
#   $3: 検索対象の文字列
assert_contains() {
  local test_name="$1"
  local needle="$2"
  local haystack="$3"
  TESTS_RUN=$((TESTS_RUN + 1))

  if echo "$haystack" | grep -qF "$needle"; then
    echo "  PASS: ${test_name}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: ${test_name}"
    echo "    '${needle}' が以下に含まれていない:"
    echo "    '${haystack}'"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# ====================================================================
# get_pr_status() のテスト
# ====================================================================
echo ""
echo "=== get_pr_status() テスト ==="

# テスト: マージ済みPRに対して MERGED を返すこと
test_get_pr_status_merged() {
  echo "[テスト] マージ済みPRに対して MERGED を返す"

  # ghコマンドのモック: merged状態のPRが存在する
  gh() {
    if [[ "$*" == *"--state merged"* ]]; then
      echo "123"
    else
      echo ""
    fi
  }
  export -f gh

  # git-utils.sh を読み込み（ghモックが有効な状態で）
  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local result
  result=$(get_pr_status "feature/test-branch")

  assert_equals "MERGED を返す" "MERGED" "$result"

  unset -f gh
}

# テスト: オープンPRに対して OPEN を返すこと
test_get_pr_status_open() {
  echo "[テスト] オープンPRに対して OPEN を返す"

  # ghコマンドのモック: merged無し、open有り
  gh() {
    if [[ "$*" == *"--state merged"* ]]; then
      echo ""
    elif [[ "$*" == *"--state open"* ]]; then
      echo "456"
    else
      echo ""
    fi
  }
  export -f gh

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local result
  result=$(get_pr_status "feature/test-branch")

  assert_equals "OPEN を返す" "OPEN" "$result"

  unset -f gh
}

# テスト: PRなしブランチに対して NONE を返すこと
test_get_pr_status_none() {
  echo "[テスト] PRなしブランチに対して NONE を返す"

  # ghコマンドのモック: merged無し、open無し
  gh() {
    echo ""
  }
  export -f gh

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local result
  result=$(get_pr_status "feature/test-branch")

  assert_equals "NONE を返す" "NONE" "$result"

  unset -f gh
}

test_get_pr_status_merged
test_get_pr_status_open
test_get_pr_status_none

# ====================================================================
# run_claude_with_recovery() のテスト
# ====================================================================
echo ""
echo "=== run_claude_with_recovery() テスト ==="

# claude モックスクリプトを配置するための一時ディレクトリ
# timeout コマンドは外部コマンドとして claude を起動するため、
# export -f によるシェル関数モックでは動作しない。
# そのため、実行可能スクリプトファイルとして PATH 先頭に配置する。
MOCK_BIN_DIR=$(mktemp -d)
trap 'rm -rf "$MOCK_BIN_DIR"' EXIT
export PATH="$MOCK_BIN_DIR:$PATH"

# claude モックスクリプトを作成するユーティリティ関数
#
# 引数:
#   $1: モックスクリプトの内容（#!/bin/bash 不要、自動付与）
create_claude_mock() {
  cat > "$MOCK_BIN_DIR/claude" <<MOCK_HEADER
#!/usr/bin/env bash
$1
MOCK_HEADER
  chmod +x "$MOCK_BIN_DIR/claude"
}

# テスト: 初回成功で即座に戻り値0を返すこと
test_recovery_first_success() {
  echo "[テスト] 初回成功で即座に戻り値0を返す"

  create_claude_mock '
cat > /dev/null  # stdinを消費
echo "成功出力"
exit 0
'

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local exit_code=0
  local output
  output=$(echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null) || exit_code=$?

  assert_exit_code "戻り値0を返す" "0" "$exit_code"
  assert_contains "出力が標準出力に転送される" "成功出力" "$output"
}

# テスト: 初回失敗・2回目成功で戻り値0を返すこと
test_recovery_second_success() {
  echo "[テスト] 初回失敗・2回目成功で戻り値0を返す"

  local attempt_file
  attempt_file=$(mktemp)
  echo "0" > "$attempt_file"

  create_claude_mock "
cat > /dev/null  # stdinを消費
count=\$(cat \"$attempt_file\")
count=\$((count + 1))
echo \"\$count\" > \"$attempt_file\"
if [ \"\$count\" -eq 1 ]; then
  echo \"エラー発生\" >&2
  exit 1
fi
echo \"成功出力\"
exit 0
"

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local exit_code=0
  echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null || exit_code=$?

  assert_exit_code "戻り値0を返す" "0" "$exit_code"

  rm -f "$attempt_file"
}

# テスト: 3回連続失敗で戻り値1を返すこと
test_recovery_all_fail() {
  echo "[テスト] 3回連続失敗で戻り値1を返す"

  create_claude_mock '
cat > /dev/null  # stdinを消費
echo "エラー発生" >&2
exit 1
'

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local exit_code=0
  echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null || exit_code=$?

  assert_exit_code "戻り値1を返す" "1" "$exit_code"
}

# テスト: 修復プロンプトにエラー出力と元プロンプトが含まれること
test_recovery_prompt_contains_error_and_original() {
  echo "[テスト] 修復プロンプトにエラー出力と元プロンプトが含まれる"

  local capture_file
  capture_file=$(mktemp)
  local attempt_file
  attempt_file=$(mktemp)
  echo "0" > "$attempt_file"

  create_claude_mock "
count=\$(cat \"$attempt_file\")
count=\$((count + 1))
echo \"\$count\" > \"$attempt_file\"
if [ \"\$count\" -eq 1 ]; then
  cat > /dev/null  # stdinを消費
  echo \"テストエラーメッセージ\" >&2
  exit 1
fi
# 2回目: 修復プロンプトをキャプチャ
cat > \"$capture_file\"
exit 0
"

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  echo "元のテストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null

  local captured
  captured=$(cat "$capture_file")

  assert_contains "エラー出力が含まれる" "テストエラーメッセージ" "$captured"
  assert_contains "元のプロンプトが含まれる" "元のテストプロンプト" "$captured"

  rm -f "$capture_file" "$attempt_file"
}

# テスト: エスカレーションマーカーを含む出力に対して終了コード2を返すこと
test_recovery_escalation_detected() {
  echo "[テスト] エスカレーションマーカー検出で戻り値2を返す"

  create_claude_mock '
cat > /dev/null  # stdinを消費
echo "処理開始"
echo "ESCALATION_REQUIRED"
echo "ブロッカー: 認証情報が必要"
echo "理由: APIキーが設定されていない"
echo "推奨アクション: APIキーを設定してください"
echo "再開条件: APIキーが環境変数に設定されること"
exit 0
'

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local exit_code=0
  echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null >/dev/null || exit_code=$?

  assert_exit_code "戻り値2を返す" "2" "$exit_code"
}

# テスト: マーカーを含まない通常出力に対して従来通りの終了コードを返すこと
test_recovery_no_escalation_normal_output() {
  echo "[テスト] マーカーなし通常出力で戻り値0を返す"

  create_claude_mock '
cat > /dev/null  # stdinを消費
echo "正常な処理結果"
echo "完了しました"
exit 0
'

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local exit_code=0
  echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null >/dev/null || exit_code=$?

  assert_exit_code "戻り値0を返す" "0" "$exit_code"
}

# テスト: エスカレーション検出時にリカバリループを中断すること
test_recovery_escalation_breaks_loop() {
  echo "[テスト] エスカレーション検出でリカバリループを中断する"

  local attempt_file
  attempt_file=$(mktemp)
  echo "0" > "$attempt_file"

  create_claude_mock "
count=\$(cat \"$attempt_file\")
count=\$((count + 1))
echo \"\$count\" > \"$attempt_file\"
if [ \"\$count\" -eq 1 ]; then
  cat > /dev/null  # stdinを消費
  echo \"エラー発生\" >&2
  exit 1
fi
cat > /dev/null  # stdinを消費
echo \"ESCALATION_REQUIRED\"
echo \"ブロッカー: 手動操作が必要\"
exit 0
"

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local exit_code=0
  echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null >/dev/null || exit_code=$?

  assert_exit_code "戻り値2を返す" "2" "$exit_code"

  local final_count
  final_count=$(cat "$attempt_file")
  assert_equals "2回目で中断（3回目に進まない）" "2" "$final_count"

  rm -f "$attempt_file"
}

# テスト: $()キャプチャで出力が取得できること（F-5 互換性）
test_recovery_capture_output() {
  echo "[テスト] \$()キャプチャで出力が取得できる"

  create_claude_mock '
cat > /dev/null  # stdinを消費
echo "行1: 処理結果"
echo "行2: 完了"
exit 0
'

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local captured
  captured=$(echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null)

  assert_contains "キャプチャ変数に行1が含まれる" "行1: 処理結果" "$captured"
  assert_contains "キャプチャ変数に行2が含まれる" "行2: 完了" "$captured"
}

# テスト: タイムアウト超過でプロセスが強制終了されること（F-2）
test_recovery_timeout() {
  echo "[テスト] タイムアウト超過で強制終了される"

  create_claude_mock '
cat > /dev/null  # stdinを消費
sleep 60
exit 0
'

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  local exit_code=0
  # タイムアウトを2秒に短縮してテスト
  export CLAUDE_TIMEOUT=2
  echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null || exit_code=$?
  unset CLAUDE_TIMEOUT

  assert_exit_code "戻り値1を返す（タイムアウト）" "1" "$exit_code"
}

# テスト: claude CLIのstdoutがパイプではなくファイルに接続されていること（F-1）
test_recovery_no_pipe() {
  echo "[テスト] claude CLIのstdoutがパイプではなくファイルに接続されている"

  local fd_check_file
  fd_check_file=$(mktemp)

  create_claude_mock "
cat > /dev/null  # stdinを消費
# /proc/self/fd/1 のリンク先を記録
readlink /proc/self/fd/1 > \"$fd_check_file\" 2>/dev/null || true
echo \"出力テスト\"
exit 0
"

  source "$VDEV_HOME/bin/lib/git-utils.sh"
  echo "テストプロンプト" | run_claude_with_recovery --allowedTools "Bash" 2>/dev/null >/dev/null

  local fd_target
  fd_target=$(cat "$fd_check_file")

  # パイプの場合は "pipe:[数字]" になる。ファイルの場合は /tmp/... 等のパスになる
  TESTS_RUN=$((TESTS_RUN + 1))
  if echo "$fd_target" | grep -qv "pipe:"; then
    echo "  PASS: stdoutがパイプではない (${fd_target})"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: stdoutがパイプに接続されている (${fd_target})"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi

  rm -f "$fd_check_file"
}

test_recovery_first_success
test_recovery_second_success
test_recovery_all_fail
test_recovery_prompt_contains_error_and_original
test_recovery_escalation_detected
test_recovery_no_escalation_normal_output
test_recovery_escalation_breaks_loop
test_recovery_capture_output
test_recovery_timeout
test_recovery_no_pipe

# ====================================================================
# rfc-init ブランチ作成冪等化のテスト
# ====================================================================
echo ""
echo "=== rfc-init ブランチ作成冪等化テスト ==="

# テスト: ブランチ作成コマンドに冪等化パターンが適用されていること
test_rfc_init_idempotent_branch() {
  echo "[テスト] rfc-init に冪等化パターンが適用されている"

  local rfc_init_content
  rfc_init_content=$(cat "$VDEV_HOME/bin/rfc-init")

  assert_contains \
    "checkout -b に 2>/dev/null フォールバックがある" \
    '2>/dev/null || git checkout "rfc/${SLUG}"' \
    "$rfc_init_content"
}

test_rfc_init_idempotent_branch

# ====================================================================
# adev.sh v3 テスト
# ====================================================================
echo ""
echo "=== adev.sh v3 テスト ==="

# テスト: フェーズマップ JSON を入力として受け付けること
test_adev_v3_phase_map_input() {
  echo "[テスト] フェーズマップ JSON 入力のコードが存在する"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "PHASE_MAP_FILE 変数が定義されている" \
    'PHASE_MAP_FILE="$2"' \
    "$adev_content"

  assert_contains \
    "jq で risk_level を取得している" \
    "jq -r '.risk_level'" \
    "$adev_content"

  assert_contains \
    "jq で slugs を取得している" \
    "jq -c '.slugs'" \
    "$adev_content"
}

# テスト: DONE フェーズのスキップ処理が存在すること
test_adev_v3_done_skip() {
  echo "[テスト] DONE フェーズのスキップが実装されている"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "DONE スキップの分岐がある" \
    'DONE。スキップ。' \
    "$adev_content"
}

# テスト: 各コマンドの直接呼出し（arfc/aimp ではなく rfc/imp）が存在すること
test_adev_v3_direct_command_calls() {
  echo "[テスト] 各コマンドの直接呼出しが実装されている"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "/rfc コマンドの直接呼出し" \
    'adapters/claude/commands/rfc.md' \
    "$adev_content"

  assert_contains \
    "/rrfc コマンドの直接呼出し" \
    'adapters/claude/commands/rrfc.md' \
    "$adev_content"

  assert_contains \
    "/imp コマンドの直接呼出し" \
    'adapters/claude/commands/imp.md' \
    "$adev_content"

  assert_contains \
    "/rimp コマンドの直接呼出し" \
    'adapters/claude/commands/rimp.md' \
    "$adev_content"

  assert_contains \
    "/vfy コマンドの直接呼出し" \
    'adapters/claude/commands/vfy.md' \
    "$adev_content"
}

# テスト: arfc/aimp への参照が存在しないこと
test_adev_v3_no_arfc_aimp() {
  echo "[テスト] arfc/aimp への参照が存在しない"

  TESTS_RUN=$((TESTS_RUN + 1))
  if ! grep -q "arfc" "$VDEV_HOME/bin/adev.sh" 2>/dev/null; then
    echo "  PASS: arfc への参照がない"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: arfc への参照がない"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi

  TESTS_RUN=$((TESTS_RUN + 1))
  if ! grep -q "aimp" "$VDEV_HOME/bin/adev.sh" 2>/dev/null; then
    echo "  PASS: aimp への参照がない"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: aimp への参照がない"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# テスト: リスクレベル分岐関数が存在すること
test_adev_v3_risk_level_functions() {
  echo "[テスト] リスクレベル分岐関数が実装されている"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "should_escalate_gate_fail 関数がある" \
    'should_escalate_gate_fail()' \
    "$adev_content"

  assert_contains \
    "should_require_merge_approval 関数がある" \
    'should_require_merge_approval()' \
    "$adev_content"

  assert_contains \
    "should_escalate_vfy 関数がある" \
    'should_escalate_vfy()' \
    "$adev_content"
}

# テスト: 単一 RFC 時の全体 E2E スキップが存在すること
test_adev_v3_single_rfc_e2e_skip() {
  echo "[テスト] 単一 RFC 時の全体 E2E スキップが実装されている"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "SLUG_COUNT による分岐がある" \
    'SLUG_COUNT' \
    "$adev_content"

  assert_contains \
    "単一 RFC スキップメッセージがある" \
    '単一 RFC のため全体 E2E テストをスキップ' \
    "$adev_content"
}

# テスト: run_claude_with_recovery が使用されていること
test_adev_v3_recovery_loop() {
  echo "[テスト] run_claude_with_recovery が使用されている"

  local count
  count=$(grep -c "run_claude_with_recovery" "$VDEV_HOME/bin/adev.sh")

  # RFC, RRFC, IMP, RIMP, VFY, 全体E2E 等で複数箇所使用
  TESTS_RUN=$((TESTS_RUN + 1))
  if [ "$count" -ge 4 ]; then
    echo "  PASS: run_claude_with_recovery が ${count} 箇所で使用されている"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: run_claude_with_recovery が ${count} 箇所しかない（4箇所以上必要）"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# テスト: stdin パイプ方式が適用されていること
test_adev_v3_stdin_pipe() {
  echo "[テスト] stdin パイプ方式が適用されている"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "PROMPT_EOF ヒアドキュメントが使われている" \
    "PROMPT_EOF" \
    "$adev_content"
}

test_adev_v3_phase_map_input
test_adev_v3_done_skip
test_adev_v3_direct_command_calls
test_adev_v3_no_arfc_aimp
test_adev_v3_risk_level_functions
test_adev_v3_single_rfc_e2e_skip
test_adev_v3_recovery_loop
test_adev_v3_stdin_pipe

# ====================================================================
# phase_to_ordinal() のテスト
# ====================================================================
echo ""
echo "=== phase_to_ordinal() テスト ==="

# adev.sh から関数定義だけを抽出して読み込む
# （adev.sh を直接 source するとスクリプト本体が実行されてしまうため）
eval "$(sed -n '/^phase_to_ordinal()/,/^}/p' "$VDEV_HOME/bin/adev.sh")"

# テスト: 全8フェーズが正しい序数を返すこと
test_phase_to_ordinal_all_phases() {
  echo "[テスト] 全8フェーズが正しい序数を返す"

  assert_equals "RFC → 0" "0" "$(phase_to_ordinal "RFC")"
  assert_equals "RRFC → 1" "1" "$(phase_to_ordinal "RRFC")"
  assert_equals "MERGE_RFC → 2" "2" "$(phase_to_ordinal "MERGE_RFC")"
  assert_equals "IMP → 3" "3" "$(phase_to_ordinal "IMP")"
  assert_equals "RIMP → 4" "4" "$(phase_to_ordinal "RIMP")"
  assert_equals "VFY → 5" "5" "$(phase_to_ordinal "VFY")"
  assert_equals "MERGE_IMPL → 6" "6" "$(phase_to_ordinal "MERGE_IMPL")"
  assert_equals "DONE → 7" "7" "$(phase_to_ordinal "DONE")"
}

# テスト: 不明なフェーズに対して 0 を返すこと
test_phase_to_ordinal_unknown() {
  echo "[テスト] 不明なフェーズに対して 0 を返す"

  assert_equals "UNKNOWN → 0" "0" "$(phase_to_ordinal "UNKNOWN")"
  assert_equals "空文字 → 0" "0" "$(phase_to_ordinal "")"
}

test_phase_to_ordinal_all_phases
test_phase_to_ordinal_unknown

# ====================================================================
# detect_current_phase() のテスト
# ====================================================================
echo ""
echo "=== detect_current_phase() テスト ==="

# detect_current_phase 関数を読み込む
eval "$(sed -n '/^detect_current_phase()/,/^}/p' "$VDEV_HOME/bin/adev.sh")"

# テスト: feature PR が MERGED の場合に DONE を返すこと
test_detect_phase_done() {
  echo "[テスト] feature PR が MERGED → DONE"

  get_pr_status() {
    if [[ "$1" == feature/* ]]; then
      echo "MERGED"
    else
      echo "NONE"
    fi
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "20260310-test-slug")
  assert_equals "DONE を返す" "DONE" "$result"

  unset -f get_pr_status
}

# テスト: review-vfy ファイルが PASS の場合に MERGE_IMPL を返すこと
test_detect_phase_merge_impl() {
  echo "[テスト] review-vfy PASS → MERGE_IMPL"

  local test_dir
  test_dir=$(mktemp -d)
  local slug="test-merge-impl"
  mkdir -p "${test_dir}/docs/rfcs/${slug}"
  echo "最終判定: PASS" > "${test_dir}/docs/rfcs/${slug}/review-vfy-r1.md"

  # git rev-parse をモックして test_dir を返す
  git() {
    if [[ "$1" == "rev-parse" ]]; then
      echo "$test_dir"
    elif [[ "$1" == "show-ref" ]]; then
      return 1
    fi
  }
  export -f git

  get_pr_status() {
    echo "NONE"
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "$slug")
  assert_equals "MERGE_IMPL を返す" "MERGE_IMPL" "$result"

  unset -f git get_pr_status
  rm -rf "$test_dir"
}

# テスト: review-impl ファイルが PASS の場合に VFY を返すこと
test_detect_phase_vfy() {
  echo "[テスト] review-impl PASS → VFY"

  local test_dir
  test_dir=$(mktemp -d)
  local slug="test-vfy"
  mkdir -p "${test_dir}/docs/rfcs/${slug}"
  echo "最終判定: PASS" > "${test_dir}/docs/rfcs/${slug}/review-impl-r1.md"

  git() {
    if [[ "$1" == "rev-parse" ]]; then
      echo "$test_dir"
    elif [[ "$1" == "show-ref" ]]; then
      return 1
    fi
  }
  export -f git

  get_pr_status() {
    echo "NONE"
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "$slug")
  assert_equals "VFY を返す" "VFY" "$result"

  unset -f git get_pr_status
  rm -rf "$test_dir"
}

# テスト: feature ブランチが存在する場合に RIMP を返すこと
test_detect_phase_rimp() {
  echo "[テスト] feature ブランチ存在 → RIMP"

  local test_dir
  test_dir=$(mktemp -d)
  local slug="test-rimp"
  mkdir -p "${test_dir}/docs/rfcs/${slug}"

  git() {
    if [[ "$1" == "rev-parse" ]]; then
      echo "$test_dir"
    elif [[ "$1" == "show-ref" && "$4" == *"feature/"* ]]; then
      return 0  # feature ブランチが存在する
    elif [[ "$1" == "show-ref" ]]; then
      return 1
    fi
  }
  export -f git

  get_pr_status() {
    echo "NONE"
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "$slug")
  assert_equals "RIMP を返す" "RIMP" "$result"

  unset -f git get_pr_status
  rm -rf "$test_dir"
}

# テスト: rfc PR が MERGED の場合に IMP を返すこと
test_detect_phase_imp() {
  echo "[テスト] rfc PR MERGED → IMP"

  local test_dir
  test_dir=$(mktemp -d)
  local slug="test-imp"
  mkdir -p "${test_dir}/docs/rfcs/${slug}"

  git() {
    if [[ "$1" == "rev-parse" ]]; then
      echo "$test_dir"
    elif [[ "$1" == "show-ref" ]]; then
      return 1
    fi
  }
  export -f git

  get_pr_status() {
    if [[ "$1" == feature/* ]]; then
      echo "NONE"
    elif [[ "$1" == rfc/* ]]; then
      echo "MERGED"
    else
      echo "NONE"
    fi
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "$slug")
  assert_equals "IMP を返す" "IMP" "$result"

  unset -f git get_pr_status
  rm -rf "$test_dir"
}

# テスト: review-gate ファイルが PASS の場合に MERGE_RFC を返すこと
test_detect_phase_merge_rfc() {
  echo "[テスト] review-gate PASS → MERGE_RFC"

  local test_dir
  test_dir=$(mktemp -d)
  local slug="test-merge-rfc"
  mkdir -p "${test_dir}/docs/rfcs/${slug}"
  echo "最終判定: PASS" > "${test_dir}/docs/rfcs/${slug}/review-gate-r1.md"

  git() {
    if [[ "$1" == "rev-parse" ]]; then
      echo "$test_dir"
    elif [[ "$1" == "show-ref" ]]; then
      return 1
    fi
  }
  export -f git

  get_pr_status() {
    echo "NONE"
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "$slug")
  assert_equals "MERGE_RFC を返す" "MERGE_RFC" "$result"

  unset -f git get_pr_status
  rm -rf "$test_dir"
}

# テスト: rfc ブランチが存在する場合に RRFC を返すこと
test_detect_phase_rrfc() {
  echo "[テスト] rfc ブランチ存在 → RRFC"

  local test_dir
  test_dir=$(mktemp -d)
  local slug="test-rrfc"
  mkdir -p "${test_dir}/docs/rfcs/${slug}"

  git() {
    if [[ "$1" == "rev-parse" ]]; then
      echo "$test_dir"
    elif [[ "$1" == "show-ref" && "$4" == *"feature/"* ]]; then
      return 1
    elif [[ "$1" == "show-ref" && "$4" == *"rfc/"* ]]; then
      return 0  # rfc ブランチが存在する
    elif [[ "$1" == "show-ref" ]]; then
      return 1
    fi
  }
  export -f git

  get_pr_status() {
    echo "NONE"
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "$slug")
  assert_equals "RRFC を返す" "RRFC" "$result"

  unset -f git get_pr_status
  rm -rf "$test_dir"
}

# テスト: 成果物が存在しない場合に RFC を返すこと
test_detect_phase_rfc() {
  echo "[テスト] 成果物なし → RFC"

  local test_dir
  test_dir=$(mktemp -d)
  local slug="test-rfc-none"
  mkdir -p "${test_dir}/docs/rfcs/${slug}"

  git() {
    if [[ "$1" == "rev-parse" ]]; then
      echo "$test_dir"
    elif [[ "$1" == "show-ref" ]]; then
      return 1
    fi
  }
  export -f git

  get_pr_status() {
    echo "NONE"
  }
  export -f get_pr_status

  local result
  result=$(detect_current_phase "$slug")
  assert_equals "RFC を返す" "RFC" "$result"

  unset -f git get_pr_status
  rm -rf "$test_dir"
}

test_detect_phase_done
test_detect_phase_merge_impl
test_detect_phase_vfy
test_detect_phase_rimp
test_detect_phase_imp
test_detect_phase_merge_rfc
test_detect_phase_rrfc
test_detect_phase_rfc

# ====================================================================
# フェーズスキップロジックのテスト
# ====================================================================
echo ""
echo "=== フェーズスキップロジック テスト ==="

# テスト: 再判定結果がマップより進んでいる場合にスキップされること
test_phase_skip_when_ahead() {
  echo "[テスト] 再判定結果がマップより進んでいる場合にスキップ"

  local actual_ord map_ord
  actual_ord=$(phase_to_ordinal "IMP")
  map_ord=$(phase_to_ordinal "RFC")

  TESTS_RUN=$((TESTS_RUN + 1))
  if [ "$actual_ord" -gt "$map_ord" ]; then
    echo "  PASS: IMP(3) > RFC(0) でスキップ条件成立"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo "  FAIL: スキップ条件が成立しない"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# テスト: 再判定結果がマップと同じ場合にスキップされないこと
test_phase_no_skip_when_same() {
  echo "[テスト] 再判定結果がマップと同じ場合にスキップしない"

  local actual_ord map_ord
  actual_ord=$(phase_to_ordinal "RFC")
  map_ord=$(phase_to_ordinal "RFC")

  TESTS_RUN=$((TESTS_RUN + 1))
  if [ "$actual_ord" -gt "$map_ord" ]; then
    echo "  FAIL: 同一フェーズでスキップ条件が成立してしまう"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  else
    echo "  PASS: RFC(0) = RFC(0) でスキップ条件不成立"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  fi
}

test_phase_skip_when_ahead
test_phase_no_skip_when_same

# ====================================================================
# 日付プレフィクス除去のテスト
# ====================================================================
echo ""
echo "=== 日付プレフィクス除去 テスト ==="

# テスト: 日付付き slug から日付が除去されること
test_date_prefix_removal() {
  echo "[テスト] 日付付き slug から日付が除去される"

  local result
  result=$(echo "20260310-test-slug" | sed 's/^[0-9]\{8\}-//')
  assert_equals "日付除去後" "test-slug" "$result"
}

# テスト: 日付なし slug がそのまま渡されること
test_date_prefix_no_change() {
  echo "[テスト] 日付なし slug がそのまま渡される"

  local result
  result=$(echo "test-slug-no-date" | sed 's/^[0-9]\{8\}-//')
  assert_equals "変更なし" "test-slug-no-date" "$result"
}

test_date_prefix_removal
test_date_prefix_no_change

# ====================================================================
# adev.sh フェーズ再判定コード存在確認テスト
# ====================================================================
echo ""
echo "=== adev.sh フェーズ再判定コード存在確認 テスト ==="

# テスト: phase_to_ordinal 関数が adev.sh に存在すること
test_adev_has_phase_to_ordinal() {
  echo "[テスト] phase_to_ordinal 関数が adev.sh に存在する"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "phase_to_ordinal 関数が定義されている" \
    "phase_to_ordinal()" \
    "$adev_content"
}

# テスト: detect_current_phase 関数が adev.sh に存在すること
test_adev_has_detect_current_phase() {
  echo "[テスト] detect_current_phase 関数が adev.sh に存在する"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "detect_current_phase 関数が定義されている" \
    "detect_current_phase()" \
    "$adev_content"
}

# テスト: フェーズ再判定ログメッセージが adev.sh に存在すること
test_adev_has_phase_redetection_log() {
  echo "[テスト] フェーズ再判定ログが adev.sh に存在する"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "フェーズ再判定ログメッセージがある" \
    "フェーズ再判定:" \
    "$adev_content"
}

# テスト: 日付プレフィクス除去処理が adev.sh に存在すること
test_adev_has_date_prefix_removal() {
  echo "[テスト] 日付プレフィクス除去処理が adev.sh に存在する"

  local adev_content
  adev_content=$(cat "$VDEV_HOME/bin/adev.sh")

  assert_contains \
    "日付プレフィクス除去の sed がある" \
    "sed 's/^[0-9]\\{8\\}-//'" \
    "$adev_content"
}

test_adev_has_phase_to_ordinal
test_adev_has_detect_current_phase
test_adev_has_phase_redetection_log
test_adev_has_date_prefix_removal

# ====================================================================
# テスト結果サマリー
# ====================================================================
echo ""
echo "=============================="
echo "テスト結果: ${TESTS_PASSED}/${TESTS_RUN} 通過"
if [ "$TESTS_FAILED" -gt 0 ]; then
  echo "失敗: ${TESTS_FAILED} 件"
  exit 1
else
  echo "全テスト通過"
  exit 0
fi
