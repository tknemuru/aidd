#!/usr/bin/env bash
# 自動開発オーケストレータ v3
#
# フェーズマップ JSON を入力として、各 slug をフェーズに応じて
# フラットに処理する。フェーズ判定はコマンド定義側（adev.md）で
# 実施済みであり、本スクリプトは判定を行わない。
#
# 使用方法:
#   bin/adev.sh <仕様書パス> <フェーズマップJSONファイル>
#
# 引数:
#   仕様書パス: 必須。サービス仕様書のファイルパス
#   フェーズマップJSONファイル: 必須。Phase 1-7 で生成されたフェーズマップ

set -euo pipefail

# Claude Code セッション内から起動された場合、子プロセスの claude -p が
# ネストセッション検出に引っかかるのを防止する。
unset CLAUDECODE

# スクリプト自身の位置から aidd リポジトリのルートを特定する。
AIDD_ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"

# shellcheck source=lib/git-utils.sh
source "$AIDD_ROOT/bin/lib/git-utils.sh"

# --- 引数チェック ---
if [ $# -lt 2 ]; then
  echo "Usage: adev.sh <仕様書パス> <フェーズマップJSONファイル>" >&2
  exit 1
fi

SPEC_PATH="$1"
PHASE_MAP_FILE="$2"

if [ ! -f "$SPEC_PATH" ]; then
  echo "エラー: 仕様書が見つかりません: $SPEC_PATH" >&2
  exit 1
fi

if [ ! -f "$PHASE_MAP_FILE" ]; then
  echo "エラー: フェーズマップが見つかりません: $PHASE_MAP_FILE" >&2
  exit 1
fi

RISK_LEVEL=$(jq -r '.risk_level' "$PHASE_MAP_FILE")
SLUGS_JSON=$(jq -c '.slugs' "$PHASE_MAP_FILE")
REPO_ROOT="$(git rev-parse --show-toplevel)"
SPEC_DIR="$(dirname "$SPEC_PATH")"
DECISION_LOG="${SPEC_DIR}/adev-decisions.md"

echo "=== 自動開発オーケストレータ v3 ==="
echo "リスクレベル: ${RISK_LEVEL}"
echo "仕様書: ${SPEC_PATH}"

# 決定ログにエントリを追記する（初回呼び出し時にヘッダーも生成）
#
# 引数:
#   $1: RFC slug
#   $2: フェーズ
#   $3: アクション
#   $4: 結果
#   $5: 備考
log_decision() {
  if [ ! -f "$DECISION_LOG" ]; then
    cat > "$DECISION_LOG" <<LOGEOF
# 自動開発 決定ログ

| タイムスタンプ | RFC slug | フェーズ | アクション | 結果 | 備考 |
|---------------|----------|---------|-----------|------|------|
LOGEOF
  fi
  local ts
  ts=$(TZ=Asia/Tokyo date +%Y-%m-%dT%H:%M%z)
  echo "| ${ts} | $1 | $2 | $3 | $4 | $5 |" >> "$DECISION_LOG"
}

# ゲート FAIL 時のエスカレーション判定関数
#
# 引数:
#   $1: リスクレベル（high / medium / low）
#   $2: ゲート名（GATE-0, GATE-I0, GATE-5, GATE-2, GATE-I1, GATE-I2 等）
#
# 戻り値:
#   0: エスカレーション必要、1: エスカレーション不要
should_escalate_gate_fail() {
  local risk="$1"
  local gate="$2"

  # GATE-0, GATE-I0 は常時エスカレーション
  case "$gate" in
    GATE-0|GATE-I0)
      return 0
      ;;
  esac

  case "$risk" in
    high|medium)
      # GATE-5, GATE-2, GATE-I1, GATE-I2 でエスカレーション
      case "$gate" in
        GATE-5|GATE-2|GATE-I1|GATE-I2)
          return 0
          ;;
      esac
      ;;
    low)
      return 1
      ;;
  esac
  return 1
}

# PR マージ前の人間承認判定関数
#
# 引数:
#   $1: リスクレベル（high / medium / low）
#
# 戻り値:
#   0: 承認必要、1: 自動マージ OK
should_require_merge_approval() {
  local risk="$1"
  case "$risk" in
    high)  return 0 ;;
    *)     return 1 ;;
  esac
}

# 検証結果のエスカレーション判定関数
#
# 引数:
#   $1: リスクレベル（high / medium / low）
#   $2: 検証結果（PASS / FAIL）
#
# 戻り値:
#   0: エスカレーション必要、1: エスカレーション不要
should_escalate_vfy() {
  local risk="$1"
  local result="$2"

  case "$risk" in
    high)
      return 0
      ;;
    medium)
      [ "$result" = "FAIL" ] && return 0
      return 1
      ;;
    low)
      return 1
      ;;
  esac
}

# フェーズ文字列を序数に変換する
#
# 引数:
#   $1: フェーズ文字列
#
# 戻り値:
#   標準出力に序数（0-7）を出力
phase_to_ordinal() {
  case "$1" in
    RFC)        echo 0 ;;
    RRFC)       echo 1 ;;
    MERGE_RFC)  echo 2 ;;
    IMP)        echo 3 ;;
    RIMP)       echo 4 ;;
    VFY)        echo 5 ;;
    MERGE_IMPL) echo 6 ;;
    DONE)       echo 7 ;;
    *)          echo 0 ;;
  esac
}

# 成果物の実状態からフェーズを再判定する
#
# 引数:
#   $1: 完全 slug（日付プレフィクス付き）
#
# 戻り値:
#   標準出力にフェーズ文字列を出力
detect_current_phase() {
  local slug="$1"
  local repo_root
  repo_root="$(git rev-parse --show-toplevel)"

  # 1. feature/<slug> の PR が MERGED → DONE
  local feature_pr_status
  feature_pr_status=$(get_pr_status "feature/${slug}")
  if [ "$feature_pr_status" = "MERGED" ]; then
    echo "DONE"
    return 0
  fi

  # 2. review-vfy の最新が PASS → MERGE_IMPL
  local latest_vfy
  latest_vfy=$(ls -1 "${repo_root}/docs/rfcs/${slug}"/review-vfy-r*.md \
    2>/dev/null | sort -V | tail -1)
  if [ -n "$latest_vfy" ] \
     && grep -qP '最終判定.*PASS' "$latest_vfy" 2>/dev/null; then
    echo "MERGE_IMPL"
    return 0
  fi

  # 3. review-impl の最新が PASS → VFY
  local latest_impl
  latest_impl=$(ls -1 "${repo_root}/docs/rfcs/${slug}"/review-impl-r*.md \
    2>/dev/null | sort -V | tail -1)
  if [ -n "$latest_impl" ] \
     && grep -qP '最終判定.*PASS' "$latest_impl" 2>/dev/null; then
    echo "VFY"
    return 0
  fi

  # 4. feature/<slug> ブランチまたは PR が存在 → RIMP
  if git show-ref --verify --quiet \
     "refs/remotes/origin/feature/${slug}" 2>/dev/null; then
    echo "RIMP"
    return 0
  fi
  local feature_open_status
  feature_open_status=$(get_pr_status "feature/${slug}")
  if [ "$feature_open_status" = "OPEN" ]; then
    echo "RIMP"
    return 0
  fi

  # 5. rfc/<slug> の PR が MERGED → IMP
  local rfc_pr_status
  rfc_pr_status=$(get_pr_status "rfc/${slug}")
  if [ "$rfc_pr_status" = "MERGED" ]; then
    echo "IMP"
    return 0
  fi

  # 6. review-gate の最新が PASS → MERGE_RFC
  local latest_gate
  latest_gate=$(ls -1 "${repo_root}/docs/rfcs/${slug}"/review-gate-r*.md \
    2>/dev/null | sort -V | tail -1)
  if [ -n "$latest_gate" ] \
     && grep -qP '最終判定.*PASS' "$latest_gate" 2>/dev/null; then
    echo "MERGE_RFC"
    return 0
  fi

  # 7. rfc/<slug> ブランチまたは PR が存在 → RRFC
  if git show-ref --verify --quiet \
     "refs/remotes/origin/rfc/${slug}" 2>/dev/null; then
    echo "RRFC"
    return 0
  fi
  if [ "$rfc_pr_status" = "OPEN" ]; then
    echo "RRFC"
    return 0
  fi

  # 8. いずれにも該当しない → RFC
  echo "RFC"
}

# --- slug ループ ---
# プロセス置換を使用してサブシェル問題を回避する
# （パイプの while read ではサブシェルで実行され exit が効かない）
while read -r entry; do
  raw_slug=$(echo "$entry" | jq -r '.slug')
  phase=$(echo "$entry" | jq -r '.phase')
  slug="$raw_slug"

  # 仕様書の slug（日付プレフィクスなし）を完全 slug（日付プレフィクス付き）に解決
  if [ ! -d "$REPO_ROOT/docs/rfcs/${slug}" ]; then
    resolved_dir=$(find "$REPO_ROOT/docs/rfcs" -maxdepth 1 -type d -name "*-${slug}" 2>/dev/null | head -1)
    if [ -n "$resolved_dir" ]; then
      slug=$(basename "$resolved_dir")
    fi
  fi

  # slug が解決済みの場合、フェーズを再判定する
  if [ "$raw_slug" != "$slug" ]; then
    actual_phase=$(detect_current_phase "$slug")
    actual_ord=$(phase_to_ordinal "$actual_phase")
    map_ord=$(phase_to_ordinal "$phase")

    if [ "$actual_ord" -gt "$map_ord" ]; then
      echo "[${slug}] フェーズ再判定: ${phase} → ${actual_phase}（スキップ）"
      phase="$actual_phase"
    fi
  fi

  echo ""
  echo "--- slug: ${slug}, phase: ${phase} ---"

  case "$phase" in
    DONE)
      echo "[${slug}] DONE。スキップ。"
      continue
      ;;
  esac

  # RFC フェーズ: rfc-init を実行後、/rfc を呼出す
  if [ "$phase" = "RFC" ]; then
    # 日付プレフィクスを防御的に除去
    slugstr=$(echo "$slug" | sed 's/^[0-9]\{8\}-//')
    echo "[${slug}] rfc-init 実行中..."
    slug=$(rfc-init "$slugstr") || {
      log_decision "$slug" "RFC作成" "rfc-init" "失敗" "-"
      echo "エラー: [${slug}] rfc-init が失敗しました。停止します。" >&2
      exit 1
    }

    echo "[${slug}] /rfc 実行中..."
    if {
      cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従ってRFCを作成せよ。
- コマンド定義: .claude/commands/rfc.md

\$ARGUMENTS の値は以下の元ネタ文章として扱え:
PROMPT_EOF
      cat "$SPEC_PATH"
      cat <<PROMPT_EOF

rfc-init は実行済みである。完全 slug は「${slug}」。
/rfc の Step 2（slugstr 生成）と Step 3（初期化）をスキップし、Step 4 から開始せよ。

エスカレーション指示:
AI が自力で完遂できないタスクに遭遇した場合、
以下の形式で標準出力に出力し、即座に処理を中断せよ。
ダミー値設定・ステップスキップ・仮完了報告は禁止する。

ESCALATION_REQUIRED
ブロッカー: {内容}
理由: {理由}
推奨アクション: {アクション}
再開条件: {条件}
PROMPT_EOF
    } | run_claude_with_recovery \
      --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch"; then
      log_decision "$slug" "RFC作成" "/rfc 実行" "成功" "-"
    else
      rc=$?
      if [ "$rc" -eq 2 ]; then
        log_decision "$slug" "RFC作成" "/rfc 実行" "エスカレーション" "-"
        exit 2
      fi
      log_decision "$slug" "RFC作成" "/rfc 実行" "失敗" "-"
      echo "エラー: [${slug}] /rfc が失敗しました。停止します。" >&2
      exit 1
    fi

    # §0 機械的コピー
    SPEC_SECTION0=$(sed -n '/^## 0\. 絶対守ること/,/^## [0-9]/{/^## [0-9]/!p;}' \
      "$SPEC_PATH" | head -20)
    if [ -n "$SPEC_SECTION0" ]; then
      RFC_FILE="$REPO_ROOT/docs/rfcs/${slug}/rfc.md"
      if [ -f "$RFC_FILE" ]; then
        TMPFILE=$(mktemp)
        awk -v sect0="$SPEC_SECTION0" '
          /^## 0\. 絶対守ること/ { skip=1; next }
          /^## 1\./ && skip { print sect0; skip=0 }
          /^## 1\./ && !skip { print; next }
          !skip { print }
        ' "$RFC_FILE" > "$TMPFILE"
        mv "$TMPFILE" "$RFC_FILE"
        git -C "$REPO_ROOT" add "$RFC_FILE"
        git -C "$REPO_ROOT" commit -m \
          "docs: copy §0 from service spec to RFC for ${slug}" || true
        git -C "$REPO_ROOT" push || true
        log_decision "$slug" "§0コピー" "sed注入" "成功" "-"
      fi
    fi

    phase="RRFC"
  fi

  # RRFC フェーズ: /rrfc + /urfc レビューループを直接呼出す
  if [ "$phase" = "RRFC" ]; then
    echo "[${slug}] /rrfc レビューループ実行中..."
    REVIEW_PASSED=false
    REVIEW_ATTEMPTS=0
    MAX_REVIEW_ATTEMPTS=8

    while [ "$REVIEW_PASSED" = "false" ] && [ "$REVIEW_ATTEMPTS" -lt "$MAX_REVIEW_ATTEMPTS" ]; do
      REVIEW_ATTEMPTS=$((REVIEW_ATTEMPTS + 1))
      echo "[${slug}] レビューラウンド ${REVIEW_ATTEMPTS}"

      RRFC_RESULT=$({
        cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従ってRFCレビューを実行せよ。
- コマンド定義: .claude/commands/rrfc.md

\$ARGUMENTS の値は「${slug}」として扱え。

最終行に PASS または FAIL とだけ出力せよ。

エスカレーション指示:
AI が自力で完遂できないタスクに遭遇した場合、
以下の形式で標準出力に出力し、即座に処理を中断せよ。
ダミー値設定・ステップスキップ・仮完了報告は禁止する。

ESCALATION_REQUIRED
ブロッカー: {内容}
理由: {理由}
推奨アクション: {アクション}
再開条件: {条件}
PROMPT_EOF
      } | run_claude_with_recovery \
        --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" || true)

      echo "$RRFC_RESULT"

      if echo "$RRFC_RESULT" | grep -q "ESCALATION_REQUIRED"; then
        log_decision "$slug" "RFCレビュー" "/rrfc 実行" "エスカレーション" "ラウンド${REVIEW_ATTEMPTS}"
        exit 2
      fi

      if echo "$RRFC_RESULT" | tail -5 | grep -q "PASS"; then
        REVIEW_PASSED=true
        log_decision "$slug" "RFCレビュー" "/rrfc 実行" "PASS" "ラウンド${REVIEW_ATTEMPTS}"
      else
        log_decision "$slug" "RFCレビュー" "/rrfc 実行" "FAIL" "ラウンド${REVIEW_ATTEMPTS}"
        # /urfc で修正
        echo "[${slug}] /urfc 修正実行中..."
        {
          cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従ってRFCを修正せよ。
- コマンド定義: .claude/commands/urfc.md

\$ARGUMENTS の値は「${slug}」として扱え。

エスカレーション指示:
AI が自力で完遂できないタスクに遭遇した場合、
以下の形式で標準出力に出力し、即座に処理を中断せよ。
ダミー値設定・ステップスキップ・仮完了報告は禁止する。

ESCALATION_REQUIRED
ブロッカー: {内容}
理由: {理由}
推奨アクション: {アクション}
再開条件: {条件}
PROMPT_EOF
        } | run_claude_with_recovery \
          --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" || true
        log_decision "$slug" "RFC修正" "/urfc 実行" "完了" "ラウンド${REVIEW_ATTEMPTS}"
      fi
    done

    if [ "$REVIEW_PASSED" = "false" ]; then
      echo "エラー: [${slug}] RFCレビューが ${MAX_REVIEW_ATTEMPTS} 回で PASS しませんでした。" >&2
      exit 1
    fi

    phase="MERGE_RFC"
  fi

  # MERGE_RFC フェーズ: RFC PR マージ
  if [ "$phase" = "MERGE_RFC" ]; then
    echo "[${slug}] RFC PR マージ中..."

    if should_require_merge_approval "$RISK_LEVEL"; then
      echo "ESCALATION_REQUIRED"
      echo "ブロッカー: RFC PR マージに人間承認が必要"
      echo "理由: リスクレベル高"
      echo "推奨アクション: PR を確認しマージしてください"
      echo "再開条件: PR がマージされていること"
      log_decision "$slug" "RFCマージ" "人間承認待ち" "エスカレーション" "リスク: ${RISK_LEVEL}"
      exit 2
    fi

    DEFAULT_BRANCH=$(get_default_branch)
    git checkout "rfc/${slug}" 2>/dev/null || true

    if gh pr merge --squash --delete-branch; then
      log_decision "$slug" "RFCマージ" "gh pr merge" "成功" "-"
      git checkout "$DEFAULT_BRANCH"
      git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
    else
      log_decision "$slug" "RFCマージ" "gh pr merge" "失敗" "-"
      echo "エラー: [${slug}] RFC PR マージが失敗しました。停止します。" >&2
      exit 1
    fi

    phase="IMP"
  fi

  # IMP フェーズ: /imp を直接呼出す
  if [ "$phase" = "IMP" ]; then
    echo "[${slug}] /imp 実行中..."
    if {
      cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従って実装を実行せよ。
- コマンド定義: .claude/commands/imp.md

\$ARGUMENTS の値は「${slug}」として扱え。

注意: /vfy の副作用を伴う操作はユーザ承認済みとして扱え。

エスカレーション指示:
AI が自力で完遂できないタスクに遭遇した場合、
以下の形式で標準出力に出力し、即座に処理を中断せよ。
ダミー値設定・ステップスキップ・仮完了報告は禁止する。

ESCALATION_REQUIRED
ブロッカー: {内容}
理由: {理由}
推奨アクション: {アクション}
再開条件: {条件}
PROMPT_EOF
    } | run_claude_with_recovery \
      --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch"; then
      log_decision "$slug" "実装" "/imp 実行" "成功" "-"
    else
      rc=$?
      if [ "$rc" -eq 2 ]; then
        log_decision "$slug" "実装" "/imp 実行" "エスカレーション" "-"
        exit 2
      fi
      log_decision "$slug" "実装" "/imp 実行" "失敗" "-"
      echo "エラー: [${slug}] /imp が失敗しました。停止します。" >&2
      exit 1
    fi

    phase="RIMP"
  fi

  # RIMP フェーズ: /rimp レビューループを直接呼出す
  if [ "$phase" = "RIMP" ]; then
    echo "[${slug}] /rimp レビューループ実行中..."
    IMPL_REVIEW_PASSED=false
    IMPL_REVIEW_ATTEMPTS=0
    MAX_IMPL_REVIEW_ATTEMPTS=8

    while [ "$IMPL_REVIEW_PASSED" = "false" ] && [ "$IMPL_REVIEW_ATTEMPTS" -lt "$MAX_IMPL_REVIEW_ATTEMPTS" ]; do
      IMPL_REVIEW_ATTEMPTS=$((IMPL_REVIEW_ATTEMPTS + 1))
      echo "[${slug}] 実装レビューラウンド ${IMPL_REVIEW_ATTEMPTS}"

      RIMP_RESULT=$({
        cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従って実装レビューを実行せよ。
- コマンド定義: .claude/commands/rimp.md

\$ARGUMENTS の値は「${slug}」として扱え。

最終行に PASS または FAIL とだけ出力せよ。

エスカレーション指示:
AI が自力で完遂できないタスクに遭遇した場合、
以下の形式で標準出力に出力し、即座に処理を中断せよ。
ダミー値設定・ステップスキップ・仮完了報告は禁止する。

ESCALATION_REQUIRED
ブロッカー: {内容}
理由: {理由}
推奨アクション: {アクション}
再開条件: {条件}
PROMPT_EOF
      } | run_claude_with_recovery \
        --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" || true)

      echo "$RIMP_RESULT"

      if echo "$RIMP_RESULT" | grep -q "ESCALATION_REQUIRED"; then
        # ゲート FAIL 時のエスカレーション判定
        # GATE-I0 検出
        if echo "$RIMP_RESULT" | grep -q "GATE-I0"; then
          log_decision "$slug" "実装レビュー" "/rimp 実行" "エスカレーション" "GATE-I0"
          exit 2
        fi
        log_decision "$slug" "実装レビュー" "/rimp 実行" "エスカレーション" "ラウンド${IMPL_REVIEW_ATTEMPTS}"
        exit 2
      fi

      if echo "$RIMP_RESULT" | tail -5 | grep -q "PASS"; then
        IMPL_REVIEW_PASSED=true
        log_decision "$slug" "実装レビュー" "/rimp 実行" "PASS" "ラウンド${IMPL_REVIEW_ATTEMPTS}"
      else
        log_decision "$slug" "実装レビュー" "/rimp 実行" "FAIL" "ラウンド${IMPL_REVIEW_ATTEMPTS}"

        # ゲート FAIL 時のエスカレーション判定
        # GATE-I0 は全リスクレベルでエスカレーション
        if echo "$RIMP_RESULT" | grep -q "GATE-I0"; then
          if should_escalate_gate_fail "$RISK_LEVEL" "GATE-I0"; then
            echo "ESCALATION_REQUIRED"
            echo "ブロッカー: 改ざんゲート GATE-I0 FAIL"
            echo "理由: 仕様書/RFC改ざんは全リスクレベルでエスカレーション"
            echo "推奨アクション: 差分を確認し対応してください"
            echo "再開条件: 改ざんが解消されていること"
            log_decision "$slug" "実装レビュー" "GATE-I0 FAIL" "エスカレーション" "リスク: ${RISK_LEVEL}"
            exit 2
          fi
        fi

        # GATE-I1, GATE-I2 のエスカレーション判定
        for gate in GATE-I1 GATE-I2; do
          if echo "$RIMP_RESULT" | grep -q "$gate"; then
            if should_escalate_gate_fail "$RISK_LEVEL" "$gate"; then
              echo "ESCALATION_REQUIRED"
              echo "ブロッカー: ${gate} FAIL でエスカレーション必要"
              echo "理由: リスクレベル ${RISK_LEVEL}"
              echo "推奨アクション: レビュー結果を確認し対応してください"
              echo "再開条件: 問題が解消されていること"
              log_decision "$slug" "実装レビュー" "${gate} FAIL" "エスカレーション" "リスク: ${RISK_LEVEL}"
              exit 2
            fi
          fi
        done

        # 自動修正: /uimp 的な修正を実行
        echo "[${slug}] 実装修正実行中..."
        {
          cat <<PROMPT_EOF
実装レビューで FAIL が検出されました。
docs/rfcs/${slug}/ 配下の最新のレビュー結果ファイルを Read で読み込み、
FAIL 項目を特定して修正せよ。
修正後、変更をコミット・プッシュせよ。

エスカレーション指示:
AI が自力で完遂できないタスクに遭遇した場合、
以下の形式で標準出力に出力し、即座に処理を中断せよ。
ダミー値設定・ステップスキップ・仮完了報告は禁止する。

ESCALATION_REQUIRED
ブロッカー: {内容}
理由: {理由}
推奨アクション: {アクション}
再開条件: {条件}
PROMPT_EOF
        } | run_claude_with_recovery \
          --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" || true
      fi
    done

    if [ "$IMPL_REVIEW_PASSED" = "false" ]; then
      echo "エラー: [${slug}] 実装レビューが ${MAX_IMPL_REVIEW_ATTEMPTS} 回で PASS しませんでした。" >&2
      exit 1
    fi

    phase="VFY"
  fi

  # VFY フェーズ: /vfy + /rvfy を直接呼出す
  if [ "$phase" = "VFY" ]; then
    echo "[${slug}] /vfy 検証実行中..."
    VFY_RESULT=$({
      cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従って検証を実行せよ。
- コマンド定義: .claude/commands/vfy.md

\$ARGUMENTS の値は「${slug}」として扱え。

注意: 副作用を伴う操作はユーザ承認済みとして扱え。
最終行に PASS または FAIL とだけ出力せよ。
PROMPT_EOF
    } | run_claude_with_recovery \
      --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" || true)

    echo "$VFY_RESULT"

    VFY_STATUS="PASS"
    if echo "$VFY_RESULT" | tail -5 | grep -q "FAIL"; then
      VFY_STATUS="FAIL"
    fi

    # /rvfy チェック
    if [ "$VFY_STATUS" = "PASS" ]; then
      echo "[${slug}] /rvfy Verification ゲートレビュー実行中..."
      RVFY_RESULT=$({
        cat <<PROMPT_EOF
以下のコマンド定義を読み込み、
その手順に従って Verification ゲートレビューを実行せよ。
- コマンド定義: .claude/commands/rvfy.md

\$ARGUMENTS の値は「${slug}」として扱え。

最終行に PASS または FAIL とだけ出力せよ。
PROMPT_EOF
      } | run_claude_with_recovery \
        --allowedTools "Bash Edit Read Write Glob Grep" || true)

      echo "$RVFY_RESULT"

      if echo "$RVFY_RESULT" | tail -5 | grep -q "FAIL"; then
        VFY_STATUS="FAIL"
      fi
    fi

    # リスクレベルに応じた分岐
    if should_escalate_vfy "$RISK_LEVEL" "$VFY_STATUS"; then
      echo "ESCALATION_REQUIRED"
      echo "ブロッカー: 検証結果(${VFY_STATUS})に対し人間確認が必要"
      echo "理由: リスクレベル ${RISK_LEVEL}"
      echo "推奨アクション: 検証結果を確認してください"
      echo "再開条件: 人間が確認・承認していること"
      log_decision "$slug" "検証" "/vfy 実行" "エスカレーション" "結果: ${VFY_STATUS}, リスク: ${RISK_LEVEL}"
      exit 2
    fi

    log_decision "$slug" "検証" "/vfy 実行" "$VFY_STATUS" "-"
    phase="MERGE_IMPL"
  fi

  # MERGE_IMPL フェーズ: 実装 PR マージ
  if [ "$phase" = "MERGE_IMPL" ]; then
    echo "[${slug}] 実装 PR マージ中..."

    if should_require_merge_approval "$RISK_LEVEL"; then
      echo "ESCALATION_REQUIRED"
      echo "ブロッカー: 実装 PR マージに人間承認が必要"
      echo "理由: リスクレベル高"
      echo "推奨アクション: PR を確認しマージしてください"
      echo "再開条件: PR がマージされていること"
      log_decision "$slug" "実装マージ" "人間承認待ち" "エスカレーション" "リスク: ${RISK_LEVEL}"
      exit 2
    fi

    DEFAULT_BRANCH=$(get_default_branch)
    git checkout "feature/${slug}" 2>/dev/null || true

    if gh pr merge --squash --delete-branch; then
      log_decision "$slug" "実装マージ" "gh pr merge" "成功" "-"
      git checkout "$DEFAULT_BRANCH"
      git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
    else
      log_decision "$slug" "実装マージ" "gh pr merge" "失敗" "-"
      echo "エラー: [${slug}] 実装 PR マージが失敗しました。停止します。" >&2
      exit 1
    fi
  fi

  echo "[${slug}] 完了。"
done < <(echo "$SLUGS_JSON" | jq -c '.[]')

# --- 全体 E2E テスト ---
SLUG_COUNT=$(echo "$SLUGS_JSON" \
  | jq '[.[] | select(.phase != "DONE")] | length')

if [ "$SLUG_COUNT" -ge 2 ]; then
  echo ""
  echo "=== 全体 E2E テスト ==="
  echo "全RFC実装完了。仕様書 §2 に基づく全体E2Eテストを実行します。"

  # /vfy を仕様書パスで実行
  VFY_RESULT=$({
    cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従って検証を実行せよ。
- コマンド定義: .claude/commands/vfy.md

\$ARGUMENTS の値は「${SPEC_PATH}」として扱え。

注意: 副作用を伴う操作はユーザ承認済みとして扱え。
最終行に PASS または FAIL とだけ出力せよ。
PROMPT_EOF
  } | run_claude_with_recovery \
    --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" || true)

  echo "$VFY_RESULT"

  # /rvfy チェック
  if echo "$VFY_RESULT" | tail -5 | grep -q "PASS"; then
    echo "[全体E2E] /vfy PASS。Verification ゲートレビューを実行中..."
    RVFY_RESULT=$({
      cat <<PROMPT_EOF
以下のコマンド定義を読み込み、
その手順に従って Verification ゲートレビューを実行せよ。
- コマンド定義: .claude/commands/rvfy.md

\$ARGUMENTS の値は「${SPEC_PATH}」として扱え。

最終行に PASS または FAIL とだけ出力せよ。
PROMPT_EOF
    } | run_claude_with_recovery \
      --allowedTools "Bash Edit Read Write Glob Grep" || true)

    echo "$RVFY_RESULT"

    if echo "$RVFY_RESULT" | tail -5 | grep -q "FAIL"; then
      VFY_RESULT="FAIL"
    fi
  fi

  if echo "$VFY_RESULT" | tail -5 | grep -q "PASS"; then
    echo "[全体E2E] 初回検証 PASS"
  else
    echo "[全体E2E] FAIL 検出。fix ブランチを作成して修正ループに入ります。"

    E2E_BRANCH="fix/e2e-$(date +%Y%m%d%H%M%S)"
    DEFAULT_BRANCH=$(get_default_branch)
    git checkout -b "$E2E_BRANCH"

    E2E_ATTEMPTS=0
    E2E_PASSED=false
    E2E_PR_CREATED=false

    while [ "$E2E_ATTEMPTS" -lt 5 ] && [ "$E2E_PASSED" = "false" ]; do
      E2E_ATTEMPTS=$((E2E_ATTEMPTS + 1))
      echo ""
      echo "[全体E2E] 修正ループ ${E2E_ATTEMPTS}/5"

      FIX_RESULT=$({
        cat <<PROMPT_EOF
仕様書（${SPEC_PATH}）と同じディレクトリにある verification-results.md を Read ツールで読み込め。
FAIL 項目を特定し、仕様書の §2 E2Eテスト要件を
参照しながら、FAIL の原因をコードレベルで診断し修正せよ。
修正後、変更をコミット・プッシュせよ。

その後、以下のコマンド定義に従って再検証を実行せよ。
- コマンド定義: .claude/commands/vfy.md
\$ARGUMENTS の値は「${SPEC_PATH}」として扱え。
注意: 副作用を伴う操作はユーザ承認済みとして扱え。
最終行に PASS または FAIL とだけ出力せよ。
PROMPT_EOF
      } | run_claude_with_recovery \
        --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" || true)

      echo "$FIX_RESULT"

      # 初回コミット検出後に push & PR 作成
      if [ "$E2E_PR_CREATED" = "false" ] \
         && [ -n "$(git log "$DEFAULT_BRANCH".."$E2E_BRANCH" --oneline 2>/dev/null)" ]; then
        git push -u origin "$E2E_BRANCH"
        gh pr create --title "fix: 全体E2Eテスト不合格の修正" \
          --body "adev 全体E2Eテストで検出された不合格項目の修正" \
          --draft
        E2E_PR_CREATED=true
      fi

      if echo "$FIX_RESULT" | tail -5 | grep -q "PASS"; then
        # /rvfy チェック（修正ループ内）
        echo "[全体E2E] /vfy PASS。Verification ゲートレビューを実行中..."
        RVFY_FIX_RESULT=$({
          cat <<PROMPT_EOF
以下のコマンド定義を読み込み、
その手順に従って Verification ゲートレビューを実行せよ。
- コマンド定義: .claude/commands/rvfy.md

\$ARGUMENTS の値は「${SPEC_PATH}」として扱え。

最終行に PASS または FAIL とだけ出力せよ。
PROMPT_EOF
        } | run_claude_with_recovery \
          --allowedTools "Bash Edit Read Write Glob Grep" || true)

        echo "$RVFY_FIX_RESULT"

        if echo "$RVFY_FIX_RESULT" | tail -5 | grep -q "FAIL"; then
          echo "[全体E2E] Verification ゲートレビュー FAIL。修正ループを継続します。"
        else
          E2E_PASSED=true
        fi
      fi
    done

    if [ "$E2E_PASSED" = "true" ]; then
      echo "[全体E2E] 修正完了 (${E2E_ATTEMPTS}回)。PR をマージします。"
      gh pr ready
      if gh pr merge --squash --delete-branch; then
        git checkout "$DEFAULT_BRANCH"
        git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
      else
        echo "エラー: 全体E2E修正 PR のマージが失敗しました。" >&2
        exit 1
      fi
    else
      echo "エラー: 全体E2Eテストが ${E2E_ATTEMPTS} 回の修正ループで解消しませんでした。" >&2
      echo "fix ブランチ: ${E2E_BRANCH}" >&2
      exit 1
    fi
  fi
else
  echo ""
  echo "=== 単一 RFC のため全体 E2E テストをスキップ ==="
fi

# --- 完了報告 ---
echo ""
echo "=== 自動開発が完了しました ==="
