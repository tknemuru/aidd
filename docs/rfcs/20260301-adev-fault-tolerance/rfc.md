# [RFC] 自動開発コマンドの耐障害性改善

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | Claude (RFC Author) |
| **ステータス** | Accepted (承認済) |
| **作成日** | 2026-03-01 |
| **タグ** | automation, fault-tolerance, idempotency |
| **関連リンク** | 先行修正: commit 7870519（自動RFC呼び出しのstdinパイプ化） |

<!-- 記述形式ルール（全セクション共通）:
1. 80文字上限: 1箇条書き項目・1テーブルセルは80文字以内
   80文字に収まらない場合はサブ項目分割またはテーブル行分割
2. 散文禁止（例外あり）:
   §1のみ散文許可（5文以内）
   §11のコードブロック間補足は2文以内の散文許可
   他セクションは散文禁止でテーブルまたは箇条書きのみ
3. §1-5 コード識別子禁止:
   バッククォートで囲まれたコード識別子の使用を禁止
   （ファイル名、関数名、変数名、パス、コマンド）
   機能名称またはドメイン用語で記述すること
-->

## 1. 背景・動機 (Motivation)

自動開発コマンドの自動実装呼び出しが、親プロセスからの起動時に標準入力の接続状態差異でエラーとなる不具合が残存している。先行修正で自動RFC呼び出しは修正済みだが、自動実装呼び出しは修正漏れである。また、コマンドを再実行しても中断箇所から再開できず、完了済みステップが重複実行されて失敗する。加えて、AI呼び出しの失敗が即座にフロー全体を中断し、自律的な修復を試みる仕組みがない。

## 2. 機能要件

### 達成すべき要件

| ID | 要件 |
|----|------|
| FR-1 | 自動実装呼び出しを標準入力パイプ方式に修正する |
| FR-2 | 実装PRのマージ状態に基づき、完了済みRFCをスキップする |
| FR-3 | RFC PRのマージ状態に基づき、RFC工程をスキップし実装工程から再開する |
| FR-4 | AI呼び出し失敗時にエラー情報を含む修復プロンプトで再実行する |
| FR-5 | 修復再実行の上限を初回含め3回とし、上限到達で停止する |
| FR-6 | RFC初期化スクリプトのブランチ作成を冪等化する |

### やらないこと

- 自動開発オーケストレータの全面的な設計見直し
- AI呼び出し以外のエラー（ネットワーク障害等）の自動リカバリー
- 指数バックオフの導入（論理エラーが主因であり待機では解決しない）

## 3. 非機能要件

### 達成すべき要件

| ID | 分類 | 要件 |
|----|------|------|
| NFR-1 | 冪等性 | 同一引数での再実行で完了済み工程が二重実行されない |
| NFR-2 | 信頼性 | AI呼び出しの一時的な論理エラーから自律回復できる |
| NFR-3 | 保守性 | 状態検知ロジックと修復ロジックが共有ライブラリに集約される |

### やらないこと

- 永続的な状態管理ファイルの導入（Git/GitHub の状態を真実源とする）

## 4. 実現方式

| 要件 | 実現方式 |
|------|----------|
| FR-1 | シェルスクリプトのAI呼び出し箇所をstdinパイプ方式に書き換える |
| FR-2, FR-3 | GitHub APIでPRマージ状態を照会し、完了済みステップをスキップする |
| FR-4, FR-5 | AI呼び出しをラップする修復ループ関数を共有ライブラリに追加する |
| FR-6 | ブランチ作成コマンドに既存ブランチへのフォールバックを追加する |
| NFR-3 | PR状態取得関数と修復ループ関数をGitユーティリティに配置する |

## 5. 代替案の検討

| 案 | 概要 | 採否 | 決定的理由 |
|----|------|------|------------|
| A: 状態検知 + 修復ループ | PRマージ状態によるスキップとAI修復ループを導入 | **採用** | 外部状態ファイル不要で実装が軽量、Git/GitHubが真実源 |
| B: チェックポイントファイル方式 | ローカルファイルに進捗状態を永続化し再開制御 | 却下 | 状態ファイルとGit/GitHub状態の不整合リスクが発生する |
| C: 各ステップを個別スクリプト化 | ステップごとに独立スクリプトとし手動で選択実行 | 却下 | 自動化の利点が失われ、ユーザの手動介入が必要になる |

## 6. 外部仕様 (External Specification)

- 自動開発コマンドの実行方法・引数に変更はない
- 中断後の再実行で、完了済みRFCは自動スキップされる
  - 実装PRマージ済み: RFC全工程をスキップ
  - RFC PRマージ済み・実装PR未マージ: 実装工程から再開
  - RFC PR未マージ: RFC工程から再実行
- AI呼び出し失敗時、最大2回の自動修復が試みられる
  - 修復中もユーザ操作は不要である
  - 3回失敗で従来通り即停止する
- RFC作成コマンドでブランチが既に存在する場合、チェックアウトで継続する

## 7. E2Eテスト仕様

| ID | 対応要件 | セットアップ手順 | 実行手順 | 期待するアウトカム |
|----|----------|------------------|----------|-------------------|
| E2E-1 | FR-1 | 2件以上のRFCエントリを含む仕様書を用意 | 自動開発コマンドを仕様書パス引数で実行 | 自動実装ステップがエラーなく完了する |
| E2E-2 | FR-2, FR-3 | 1件目のRFC・実装PRがマージ済み、2件目が未着手の仕様書を用意 | 自動開発コマンドを再実行 | 1件目がスキップされ、2件目から処理開始 |
| E2E-3 | FR-2, FR-3 | RFC PRマージ済み・実装PR未マージのRFCを含む仕様書を用意 | 自動開発コマンドを再実行 | RFC工程がスキップされ、実装工程から再開 |
| E2E-4 | FR-4, FR-5 | 初回失敗・2回目成功となる状況を用意 | 自動開発コマンドを実行 | 1回目失敗後に修復実行され、2回目で工程完了 |
| E2E-5 | FR-6 | RFCブランチが既に存在する状態を用意 | RFC作成コマンドを同一slugで実行 | エラーなくブランチがチェックアウトされる |

## 8. ドキュメント編集仕様

| 対象ファイル | 操作 | 変更内容 |
|-------------|------|----------|
| `bin/adev.sh` | 更新 | stdinパイプ化、冪等性スキップ、修復ループ適用 |
| `bin/lib/git-utils.sh` | 更新 | PR状態取得関数とAI修復ループ関数を追加 |
| `bin/rfc-init` | 更新 | ブランチ作成の冪等化（既存ブランチへのフォールバック） |
| `docs/architecture.md` | 該当なし | 本リポジトリには未設置のためスキップ |
| `docs/domain-model.md` | 該当なし | 本リポジトリには未設置のためスキップ |
| `docs/api-overview.md` | 該当なし | 本リポジトリには未設置のためスキップ |

## 9. Task計画

<!-- Phase/フェーズによる作業分割を禁止する。 -->
<!-- 全作業項目は単一のPRで完遂すること。 -->
<!-- §7 のセットアップ手順に記載した環境準備は本セクションに「セットアップ」種別のタスクとして含めること。 -->

| # | 種別 | 作業内容 | 依存 |
|---|------|----------|------|
| 1 | コード | Gitユーティリティにpr状態取得関数を追加する | - |
| 2 | コード | GitユーティリティにAI修復ループ関数を追加する | - |
| 3 | コード | 自動開発スクリプトのstdinパイプ化を行う | - |
| 4 | コード | 自動開発スクリプトに冪等性スキップを導入する | 1 |
| 5 | コード | 自動開発スクリプトにAI修復ループを適用する | 2 |
| 6 | コード | RFC初期化スクリプトのブランチ作成を冪等化する | - |

### ロールバック基準と手順

- 冪等性スキップが誤判定で正常ステップを飛ばす場合、対象コミットを取り消す
- 修復ループが無限ループ化する場合、対象コミットを取り消す
- 手順: `git revert` で対象コミットを取り消す

## 10. 前提条件・依存関係

| 種別 | 内容 |
|------|------|
| ツール | gh CLI がインストールされ認証済みであること |
| ツール | claude CLI が非対話モードをサポートしていること |
| 前提 | commit 7870519 の修正（自動RFC呼び出しのstdinパイプ化）がマージ済みであること |

## 11. 詳細設計 (Detailed Design)

### 11.1 PR状態取得関数

`bin/lib/git-utils.sh` に `get_pr_status()` を追加する。

```bash
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
```

### 11.2 AI修復ループ関数

`bin/lib/git-utils.sh` に `run_claude_with_recovery()` を追加する。

```bash
# claude -p をエラー修復ループ付きで実行する
#
# stdinからプロンプトを受け取り、claude -p に渡す。
# 失敗時はエラー出力を含む修復プロンプトで最大2回再実行する。
#
# 引数:
#   $@: claude -p に渡す追加オプション（--allowedTools 等）
#
# stdin:
#   claude -p に渡すプロンプト本文
#
# 戻り値:
#   成功時 0、最大試行到達時 1
run_claude_with_recovery() {
  local max_attempts=3
  local attempt=1
  local tmpfile
  tmpfile=$(mktemp)
  local errfile
  errfile=$(mktemp)
  trap 'rm -f "$tmpfile" "$errfile"' RETURN

  # stdinを一時ファイルに保存
  cat > "$tmpfile"

  while [ "$attempt" -le "$max_attempts" ]; do
    echo "[claude] 試行 ${attempt}/${max_attempts}" >&2

    if [ "$attempt" -eq 1 ]; then
      # 初回: 元のプロンプトをそのまま実行
      if cat "$tmpfile" | claude -p "$@" 2>"$errfile"; then
        return 0
      fi
    else
      # 修復: エラー情報を含むプロンプトで再実行
      {
        cat <<RECOVERY_EOF
前回の実行が以下のエラーで失敗した。
エラー内容を分析し、問題を調査・修復した上で、
元のタスクを完遂せよ。

--- エラー出力 ---
$(cat "$errfile")

--- 元のプロンプト ---
$(cat "$tmpfile")
RECOVERY_EOF
      } | claude -p "$@" 2>"$errfile"; then
        return 0
      fi
    fi

    echo "[claude] 試行 ${attempt} 失敗" >&2
    attempt=$((attempt + 1))
  done

  echo "[claude] 最大試行回数(${max_attempts})に到達" >&2
  return 1
}
```

### 11.3 自動開発スクリプトのstdinパイプ化

`bin/adev.sh` の Step 3-3（自動実装呼び出し）を修正する。

修正前（位置引数方式）:

```bash
if claude -p \
  --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" \
  "以下のコマンド定義を読み込み、その手順に従って実装を自動実行せよ。
- コマンド定義: ~/projects/vdev/adapters/claude/commands/aimp.md

\$ARGUMENTS の値は「${slug}」として扱え。

注意: /vfy の副作用を伴う操作はユーザ承認済みとして扱え。"; then
```

修正後（stdinパイプ方式）:

```bash
if {
  cat <<PROMPT_EOF
以下のコマンド定義を読み込み、その手順に従って実装を自動実行せよ。
- コマンド定義: ~/projects/vdev/adapters/claude/commands/aimp.md

\$ARGUMENTS の値は「${slug}」として扱え。

注意: /vfy の副作用を伴う操作はユーザ承認済みとして扱え。
PROMPT_EOF
} | claude -p \
  --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch"; then
```

### 11.4 冪等性スキップの導入

`bin/adev.sh` の Phase 3 ループ冒頭に状態検知を追加する。

```bash
for slug in "${SLUGS[@]}"; do
  # --- 冪等性: 完了済みスキップ ---
  FEATURE_STATUS=$(get_pr_status "feature/${slug}")
  if [ "$FEATURE_STATUS" = "MERGED" ]; then
    echo "[${slug}] 実装PR マージ済み。スキップします。"
    COMPLETED=$((COMPLETED + 1))
    continue
  fi

  RFC_STATUS=$(get_pr_status "rfc/${slug}")

  # ... 以降のステップ ...

  # Step 3-1, 3-2 の前にRFCスキップ判定
  if [ "$RFC_STATUS" = "MERGED" ]; then
    echo "[${slug}] RFC PR マージ済み。実装工程から再開します。"
  else
    # --- Step 3-1: 自動 RFC ---
    # (既存処理)

    # --- Step 3-2: RFC PR マージ ---
    # (既存処理)
  fi

  # --- Step 3-3: 自動実装 ---
  # (既存処理)

  # --- Step 3-4: 実装 PR マージ ---
  # (既存処理)
done
```

### 11.5 AI修復ループの適用

Step 3-1 と Step 3-3 の `claude -p` 呼び出しを `run_claude_with_recovery()` に置き換える。

Step 3-1 の適用例:

```bash
if {
  cat <<PROMPT_EOF
以下のコマンド定義を読み込み、...
PROMPT_EOF
} | run_claude_with_recovery \
  --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch"; then
```

Step 3-3 も同様に置き換える。

### 11.6 RFC初期化スクリプトのブランチ作成冪等化

`bin/rfc-init` の L60 を修正する。

修正前:

```bash
git checkout -b "rfc/${SLUG}"
```

修正後:

```bash
git checkout -b "rfc/${SLUG}" 2>/dev/null || git checkout "rfc/${SLUG}"
```

`adapters/claude/commands/imp.md` が既に採用しているパターンと同じである。

### 単体テスト仕様

| テスト対象 | 検証観点 |
|-----------|----------|
| PR状態取得関数 | マージ済みPRに対して MERGED を返すこと |
| PR状態取得関数 | オープンPRに対して OPEN を返すこと |
| PR状態取得関数 | PRなしブランチに対して NONE を返すこと |
| AI修復ループ関数 | 初回成功で即座に戻り値0を返すこと |
| AI修復ループ関数 | 初回失敗・2回目成功で戻り値0を返すこと |
| AI修復ループ関数 | 3回連続失敗で戻り値1を返すこと |
| AI修復ループ関数 | 修復プロンプトにエラー出力と元プロンプトが含まれること |
| 冪等性スキップ | 実装PRマージ済みでslug全体がスキップされること |
| 冪等性スキップ | RFC PRマージ済みで実装工程から再開されること |
| ブランチ作成冪等化 | ブランチ未存在で新規作成されること |
| ブランチ作成冪等化 | ブランチ既存でチェックアウトされること |
