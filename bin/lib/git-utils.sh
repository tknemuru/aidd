#!/usr/bin/env bash
# Git関連のユーティリティ関数

# デフォルトブランチ名を取得する
# リモートから取得できない場合は main → master の順でフォールバック
#
# 戻り値:
#   標準出力にデフォルトブランチ名を出力
get_default_branch() {
  local branch

  # 1. リモートのHEADから取得を試行
  branch=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')

  if [ -n "$branch" ]; then
    echo "$branch"
    return 0
  fi

  # 2. ローカルブランチの存在確認でフォールバック
  if git show-ref --verify --quiet refs/heads/main; then
    echo "main"
  elif git show-ref --verify --quiet refs/heads/master; then
    echo "master"
  else
    echo "main" # デフォルト
  fi
}

# 指定ブランチのPR状態を取得する
#
# 引数:
#   $1: ブランチ名（例: rfc/20260301-xxx, feature/20260301-xxx）
#
# 戻り値:
#   標準出力に "MERGED", "OPEN", "NONE" のいずれかを出力
get_pr_status() {
  local branch="$1"

  if [ -n "$(gh pr list --head "$branch" --state merged \
    --json number --jq '.[0].number' 2>/dev/null)" ]; then
    echo "MERGED"
    return 0
  fi

  if [ -n "$(gh pr list --head "$branch" --state open \
    --json number --jq '.[0].number' 2>/dev/null)" ]; then
    echo "OPEN"
    return 0
  fi

  echo "NONE"
}

# claude -p をエラー修復ループ付きで実行する
#
# stdinからプロンプトを受け取り、claude -p に渡す。
# パイプを使わずファイルリダイレクトで入出力を接続する。
# （claude CLI の非TTYパイプハングバグを回避するため）
# 失敗時はエラー出力を含む修復プロンプトで最大2回再実行する。
# 出力に ESCALATION_REQUIRED マーカーが含まれる場合は
# リカバリループを中断し終了コード2で即座に終了する。
# 各試行には timeout 安全弁（デフォルト3600秒）を設ける。
#
# 引数:
#   $@: claude -p に渡す追加オプション（--allowedTools 等）
#
# stdin:
#   claude -p に渡すプロンプト本文
#
# 環境変数:
#   CLAUDE_TIMEOUT: タイムアウト秒数（デフォルト: 3600）
#
# 戻り値:
#   成功時 0、最大試行到達時 1、エスカレーション検出時 2
run_claude_with_recovery() {
  local max_attempts=3
  local attempt=1
  local claude_timeout="${CLAUDE_TIMEOUT:-3600}"
  local tmpfile errfile outfile
  tmpfile=$(mktemp)
  errfile=$(mktemp)
  outfile=$(mktemp)
  trap 'rm -f "$tmpfile" "$errfile" "$outfile"' RETURN

  # stdinを一時ファイルに保存
  cat > "$tmpfile"

  while [ "$attempt" -le "$max_attempts" ]; do
    echo "[claude] 試行 ${attempt}/${max_attempts}" >&2

    if [ "$attempt" -eq 1 ]; then
      # 初回: 元のプロンプトをそのまま実行（ファイルリダイレクト方式）
      echo "[DEBUG] run_claude_with_recovery: claude -p 開始 (試行${attempt}): $(date +%H:%M:%S)" >&2
      if timeout "$claude_timeout" claude -p "$@" < "$tmpfile" > "$outfile" 2>"$errfile"; then
        # エスカレーションマーカー検出
        if grep -q "ESCALATION_REQUIRED" "$outfile"; then
          echo "[claude] エスカレーション検出" >&2
          cat "$outfile"
          return 2
        fi
        cat "$outfile"
        return 0
      fi
    else
      # 修復: エラー情報を含むプロンプトで再実行
      # errfile の内容を事前に変数に保存する
      local prev_error
      prev_error=$(cat "$errfile")
      local orig_prompt
      orig_prompt=$(cat "$tmpfile")
      # 修復プロンプトを一時ファイルに書き込んでからリダイレクトで渡す
      cat <<RECOVERY_EOF > "$tmpfile"
前回の実行が以下のエラーで失敗した。
エラー内容を分析し、問題を調査・修復した上で、
元のタスクを完遂せよ。

--- エラー出力 ---
${prev_error}

--- 元のプロンプト ---
${orig_prompt}
RECOVERY_EOF
      if timeout "$claude_timeout" claude -p "$@" < "$tmpfile" > "$outfile" 2>"$errfile"; then
        # エスカレーションマーカー検出
        if grep -q "ESCALATION_REQUIRED" "$outfile"; then
          echo "[claude] エスカレーション検出" >&2
          cat "$outfile"
          return 2
        fi
        cat "$outfile"
        return 0
      fi
    fi

    echo "[claude] 試行 ${attempt} 失敗" >&2
    attempt=$((attempt + 1))
  done

  echo "[claude] 最大試行回数(${max_attempts})に到達" >&2
  return 1
}
