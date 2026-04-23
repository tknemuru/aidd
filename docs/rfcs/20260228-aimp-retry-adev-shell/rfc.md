# [RFC] 自動実装の Verification 修正ループ追加と自動開発のシェルスクリプト化

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | Claude (AI) |
| **ステータス** | Accepted (承認済) |
| **作成日** | 2026-02-28 |
| **タグ** | automation, OOM, reliability |
| **関連リンク** | OOM分析レポート: gale-v0/docs/reports/20260227-report-adev-oom-analysis.md |

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

自動開発コマンドは単一プロセス内で多重ネスト Task を連続実行するため、6 RFC 程度で JavaScript ヒープメモリが枯渇する OOM 問題が発生している。根本原因は RFC 単位でのプロセス分離が行われていないことにある。また、自動実装コマンドは Verification で FAIL が出ると報告して即終了する設計であり、本来自動実装が持つべきリトライ責務を自動開発の Tier 2 リカバリーが肩代わりしている責務配置ミスがある。本 RFC では、自動実装に Verification 修正ループを追加して責務を正規化し、自動開発をシェルスクリプト化してプロセス分離による OOM の根本解決を図る。

## 2. 機能要件

### 達成すべき要件

| ID | 要件 |
|----|------|
| FR-1 | 自動実装の Verification FAIL 時に修正→再検証ループを最大3回実行する |
| FR-2 | 修正ループで全 PASS になった場合、レビューフェーズに自動遷移する |
| FR-3 | 修正ループが上限に達した場合、FAIL 項目を報告して終了する |
| FR-4 | 自動開発を外部シェルスクリプトで実装し、RFC 単位で独立プロセスを起動する |
| FR-5 | シェルスクリプトで前提条件ゲートを実行し、FAIL なら停止する |
| FR-6 | シェルスクリプトで仕様書から RFC slug 一覧を抽出する |
| FR-7 | RFC 単位で自動 RFC 実行→PR マージ→自動実装実行→PR マージを直列実行する |
| FR-8 | 各ステップの結果を決定ログに追記する |
| FR-9 | 失敗時は即停止する（Tier 2 リカバリーは行わない） |

### やらないこと

- 自動開発の Tier 2 リカバリー機構の維持（全面削除する）
- 実装修正コマンドの Verification 修正への流用
- 自動 RFC・自動実装コマンド自体の内部構造変更（FR-1〜3 を除く）

## 3. 非機能要件

### 達成すべき要件

| ID | 分類 | 要件 |
|----|------|------|
| NFR-1 | 信頼性 | RFC 単位でプロセスが分離され、メモリが確実にリセットされる |
| NFR-2 | 保守性 | 自動開発コマンド定義は薄いラッパーとして簡素化される |
| NFR-3 | 保守性 | リトライ責務が各コマンドに自己完結で配置される |

### やらないこと

- ヒープ上限の引き上げによる暫定対応
- Task ネスト構造自体の見直し

## 4. 実現方式

| 要件 | 実現方式 |
|------|----------|
| FR-1〜3 | 自動実装コマンド定義に Verification ループを追加する |
| FR-1 の修正タスク | 検証結果と RFC を読み込む専用修正 Task を定義する |
| FR-4, NFR-1 | 外部シェルスクリプトで RFC 単位に独立プロセスを起動する |
| FR-5〜6 | 非対話モードで前提条件検証と slug 抽出を実行する |
| FR-7 | シェルスクリプト内のループで直列実行する |
| FR-8 | 各ステップの結果をファイルに追記する |
| FR-9, NFR-3 | 失敗時は即停止し、リトライは各コマンドの自前ループに委ねる |
| NFR-2 | 自動開発コマンド定義をシェルスクリプト実行ガイドに簡素化する |

## 5. 代替案の検討

| 案 | 概要 | 採否 | 決定的理由 |
|----|------|------|------------|
| A: シェルスクリプト化 + 責務正規化 | プロセス分離 + リトライ責務移譲 | **採用** | OOM 根本解決 + 責務が明確化 |
| B: コンテキストリセット方式 | 親エージェント内でコンテキストクリア | 却下 | クリア手段が現行仕様に存在しない |
| C: Task ネスト削減のみ | 二重ネスト解消で直接呼び出し | 却下 | メモリ改善のみで根本解決にならない |

## 6. 外部仕様 (External Specification)

- 自動実装コマンドは Verification FAIL 時に最大3回の自動修正を試みる
  - 修正→再検証のループ中、ユーザ操作は不要である
  - 3回の修正で解決しない場合は FAIL 項目を報告して終了する
- 自動開発コマンドの実行方法が変更される
  - 従来: 対話セッション内でスラッシュコマンドとして実行
  - 変更後: シェルスクリプトをターミナルから直接実行する
  - 実行形式: `bin/adev.sh <仕様書パス> [セクション名]`
- 自動開発の Tier 2 リカバリーは廃止される
  - 各コマンド（自動 RFC、自動実装）が自前でリトライを持つ
  - いずれかのステップが失敗した場合、即停止する
- 各 RFC の処理結果は決定ログに記録される

## 7. E2Eテスト仕様

| ID | 対応要件 | セットアップ手順 | 実行手順 | 期待するアウトカム |
|----|----------|------------------|----------|-------------------|
| E2E-1 | FR-1, FR-2 | 承認済み RFC と Verification FAIL を含む feature ブランチを用意 | 自動実装コマンドを対象 slug で実行 | FAIL 検出→自動修正→再検証 PASS→レビューフェーズに遷移 |
| E2E-2 | FR-1, FR-3 | 3回で解決不能な Verification FAIL を含む feature ブランチを用意 | 自動実装コマンドを対象 slug で実行 | 3回ループ後 FAIL 報告して終了 |
| E2E-3 | FR-4, FR-7, NFR-1 | 2件以上の RFC エントリを含む仕様書を用意 | シェルスクリプトを仕様書パス引数で実行 | RFC 単位で独立プロセス起動、各 RFC の全工程が順次完了 |
| E2E-4 | FR-5 | 前提条件に未設定の環境情報を含む仕様書を用意 | シェルスクリプトを仕様書パス引数で実行 | 前提条件エラー報告、処理開始前に停止 |
| E2E-5 | FR-9 | 3件の RFC エントリで2件目が失敗する状態を用意 | シェルスクリプトを仕様書パス引数で実行 | 1件目完了、2件目失敗で即停止、3件目未着手 |
| E2E-6 | FR-8 | 1件以上の RFC エントリを含む仕様書を用意 | シェルスクリプトを仕様書パス引数で実行 | 各ステップの結果が決定ログに記録 |

## 8. ドキュメント編集仕様

| 対象ファイル | 操作 | 変更内容 |
|-------------|------|----------|
| `adapters/claude/commands/aimp.md` | 更新 | Phase 1.5 に Verification 修正ループを追加する |
| `adapters/claude/commands/adev.md` | 更新 | シェルスクリプト実行ガイドに簡素化し、Tier 2 リカバリーを削除する |
| `bin/adev.sh` | 作成 | RFC 単位の独立プロセスオーケストレータを新規作成する |
| `docs/architecture.md` | 該当なし | 本リポジトリには未設置のためスキップ |
| `docs/domain-model.md` | 該当なし | 本リポジトリには未設置のためスキップ |
| `docs/api-overview.md` | 該当なし | 本リポジトリには未設置のためスキップ |

## 9. Task計画

| # | 種別 | 作業内容 | 依存 |
|---|------|----------|------|
| 1 | コード | 自動実装コマンド定義（aimp.md）に Verification 修正ループを追加する | - |
| 2 | コード | 外部シェルスクリプト（bin/adev.sh）を新規作成する | - |
| 3 | コード | 自動開発コマンド定義（adev.md）をシェルスクリプト実行ガイドに簡素化する | 2 |

### ロールバック基準と手順

- 自動実装の Verification 修正ループが正常動作しない場合、aimp.md を変更前に戻す
- シェルスクリプトに致命的な不具合がある場合、adev.md を変更前に戻す
- 手順: `git revert` で対象コミットを取り消す

## 10. 前提条件・依存関係

| 種別 | 内容 |
|------|------|
| ツール | claude CLI が非対話モード（`-p` オプション）をサポートしていること |
| ツール | gh CLI がインストールされ認証済みであること |
| コマンド | 自動 RFC コマンド、自動実装コマンドが正常動作すること |
| コマンド | Verification コマンドが正常動作すること |

## 11. 詳細設計 (Detailed Design)

### 11.1 自動実装コマンドの Verification 修正ループ

`adapters/claude/commands/aimp.md` の Phase 1.5 を以下に変更する。

```markdown
### Phase 1.5: Verification ループ

verification_attempts カウンターを 0 で初期化する。

#### Step 1.5-1: Verification 実行（/vfy 呼び出し）

以下のプロンプトで Task を起動し、Verification を実行させよ。

{既存の /vfy 呼び出しプロンプト（変更なし）}

#### Step 1.5-2: 判定

Task の結果から Verification の判定を確認する。

- **全 PASS の場合**: Phase 2 へ進む。
- **FAIL あり かつ verification_attempts < 3 の場合**: Step 1.5-3 へ進む。
- **FAIL あり かつ verification_attempts >= 3 の場合**:
  FAIL 項目をユーザに報告して終了する。

#### Step 1.5-3: Verification FAIL 修正（Task経由）

verification_attempts をインクリメントする。

以下のプロンプトで Task を起動し、FAIL 項目を修正させよ。

「docs/rfcs/{slug}/verification-results.md と
docs/rfcs/{slug}/rfc.md を Read ツールで読み込め。
Verification 結果から FAIL 項目を特定し、RFC の設計意図と
E2Eテスト仕様を参照しながら、FAIL の原因をコードレベルで
診断し修正せよ。修正後、プロジェクトのテストコマンドを
実行して通過を確認し、変更をコミット・プッシュせよ。」

Task 完了後、Step 1.5-1 に戻る。
```

実装修正コマンドを流用しない理由は以下の通りである。

- 実装修正コマンドはレビュー指摘ファイル（review-imp-*.md）を読む設計である
- Verification 修正では検証結果ファイル（verification-results.md）を読む必要がある
- 入力ファイルの形式・修正の判断基準が異なるため、責務が混同される

### 11.2 外部シェルスクリプト bin/adev.sh

`bin/adev.sh` を新規作成する。

```bash
#!/usr/bin/env bash
set -euo pipefail

VDEV_HOME="$HOME/projects/vdev"

# shellcheck source=lib/git-utils.sh
source "$VDEV_HOME/bin/lib/git-utils.sh"

# --- 引数チェック ---
if [ $# -lt 1 ]; then
  echo "Usage: adev.sh <仕様書パス> [セクション名]" >&2
  exit 1
fi

SPEC_PATH="$1"
SECTION="${2:-4.3}"

if [ ! -f "$SPEC_PATH" ]; then
  echo "エラー: 仕様書が見つかりません: $SPEC_PATH" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
SPEC_CONTENT="$(cat "$SPEC_PATH")"

# --- Phase 1: 前提条件ゲート ---
echo "=== Phase 1: 前提条件検証 ==="

GATE_RESULT=$(claude -p \
  --allowedTools "Bash(git:*) Read Glob Grep" \
  "以下の仕様書の §4.1（必要な環境情報）と §4.2（事前の人間タスク）を検証せよ。
全項目が充足されていれば OK とだけ出力せよ。
1件でも未充足があれば、未充足項目を一覧表示し最後に FAIL と出力せよ。

仕様書:
$SPEC_CONTENT")

echo "$GATE_RESULT"

if echo "$GATE_RESULT" | grep -q "FAIL"; then
  echo "前提条件が未充足のため停止します。" >&2
  exit 1
fi

# --- Phase 2: RFC slug 一覧の抽出 ---
echo "=== Phase 2: RFC slug 一覧抽出 ==="

SLUGS_JSON=$(claude -p \
  --allowedTools "Read" \
  "以下の仕様書のセクション ${SECTION} から
RFC 一覧テーブルをパースし、slug のリストを JSON 配列で出力せよ。
出力は JSON 配列のみとし、他のテキストは一切含めるな。
例: [\"slug-1\", \"slug-2\"]

仕様書:
$SPEC_CONTENT")

echo "抽出された slug 一覧: $SLUGS_JSON"

# JSON 配列から slug を取り出す
SLUGS=($(echo "$SLUGS_JSON" | jq -r '.[]'))

if [ ${#SLUGS[@]} -eq 0 ]; then
  echo "エラー: RFC slug が抽出できませんでした。" >&2
  exit 1
fi

TOTAL=${#SLUGS[@]}
COMPLETED=0

# --- Phase 3: RFC 単位の直列ループ ---
echo "=== Phase 3: RFC 直列実行 (全 ${TOTAL} 件) ==="

for slug in "${SLUGS[@]}"; do
  echo ""
  echo "--- [$((COMPLETED + 1))/${TOTAL}] slug: ${slug} ---"

  DECISION_LOG="$REPO_ROOT/docs/rfcs/${slug}/adev-decisions.md"
  TIMESTAMP=$(TZ=Asia/Tokyo date +%Y-%m-%dT%H:%M%z)

  # 決定ログ初期化
  mkdir -p "$(dirname "$DECISION_LOG")"
  if [ ! -f "$DECISION_LOG" ]; then
    cat > "$DECISION_LOG" <<LOGEOF
# 自動開発 決定ログ

| タイムスタンプ | フェーズ | アクション | 結果 | 備考 |
|---------------|---------|-----------|------|------|
LOGEOF
  fi

  # --- Step 3-1: 自動 RFC ---
  echo "[${slug}] 自動 RFC 実行中..."
  TIMESTAMP=$(TZ=Asia/Tokyo date +%Y-%m-%dT%H:%M%z)

  if claude -p \
    --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" \
    "以下のコマンド定義を読み込み、その手順に従ってRFCの作成・レビューを自動実行せよ。
- コマンド定義: ~/projects/vdev/adapters/claude/commands/arfc.md

\$ARGUMENTS の値は以下の元ネタ文章として扱え:
${SPEC_CONTENT}

対象 RFC の slug: ${slug}"; then
    echo "| ${TIMESTAMP} | RFC作成 | /arfc 実行 | 成功 | - |" \
      >> "$DECISION_LOG"
  else
    echo "| ${TIMESTAMP} | RFC作成 | /arfc 実行 | 失敗 | - |" \
      >> "$DECISION_LOG"
    echo "エラー: [${slug}] 自動 RFC が失敗しました。停止します。" >&2
    exit 1
  fi

  # --- Step 3-2: RFC PR マージ ---
  echo "[${slug}] RFC PR マージ中..."
  TIMESTAMP=$(TZ=Asia/Tokyo date +%Y-%m-%dT%H:%M%z)

  DEFAULT_BRANCH=$(get_default_branch)
  git checkout "rfc/${slug}" 2>/dev/null || true

  if gh pr merge --squash --delete-branch; then
    echo "| ${TIMESTAMP} | RFCマージ | gh pr merge | 成功 | - |" \
      >> "$DECISION_LOG"
    git checkout "$DEFAULT_BRANCH"
    git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
  else
    echo "| ${TIMESTAMP} | RFCマージ | gh pr merge | 失敗 | - |" \
      >> "$DECISION_LOG"
    echo "エラー: [${slug}] RFC PR マージが失敗しました。停止します。" >&2
    exit 1
  fi

  # --- Step 3-3: 自動実装 ---
  echo "[${slug}] 自動実装実行中..."
  TIMESTAMP=$(TZ=Asia/Tokyo date +%Y-%m-%dT%H:%M%z)

  if claude -p \
    --allowedTools "Bash Edit Read Write Glob Grep WebFetch WebSearch" \
    "以下のコマンド定義を読み込み、その手順に従って実装を自動実行せよ。
- コマンド定義: ~/projects/vdev/adapters/claude/commands/aimp.md

\$ARGUMENTS の値は「${slug}」として扱え。

注意: /vfy の副作用を伴う操作はユーザ承認済みとして扱え。"; then
    echo "| ${TIMESTAMP} | 実装 | /aimp 実行 | 成功 | - |" \
      >> "$DECISION_LOG"
  else
    echo "| ${TIMESTAMP} | 実装 | /aimp 実行 | 失敗 | - |" \
      >> "$DECISION_LOG"
    echo "エラー: [${slug}] 自動実装が失敗しました。停止します。" >&2
    exit 1
  fi

  # --- Step 3-4: 実装 PR マージ ---
  echo "[${slug}] 実装 PR マージ中..."
  TIMESTAMP=$(TZ=Asia/Tokyo date +%Y-%m-%dT%H:%M%z)

  git checkout "feature/${slug}" 2>/dev/null || true

  if gh pr merge --squash --delete-branch; then
    echo "| ${TIMESTAMP} | 実装マージ | gh pr merge | 成功 | - |" \
      >> "$DECISION_LOG"
    git checkout "$DEFAULT_BRANCH"
    git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
  else
    echo "| ${TIMESTAMP} | 実装マージ | gh pr merge | 失敗 | - |" \
      >> "$DECISION_LOG"
    echo "エラー: [${slug}] 実装 PR マージが失敗しました。停止します。" >&2
    exit 1
  fi

  COMPLETED=$((COMPLETED + 1))

  # --- 進捗サマリー ---
  RFC_PR_URL=$(gh pr list --search "rfc/${slug}" \
    --state merged --json url --jq '.[0].url' 2>/dev/null || echo "N/A")
  IMP_PR_URL=$(gh pr list --search "feature/${slug}" \
    --state merged --json url --jq '.[0].url' 2>/dev/null || echo "N/A")

  echo ""
  echo "[進捗] ${COMPLETED}/${TOTAL} 完了"
  echo "- slug: ${slug}"
  echo "- RFC PR: ${RFC_PR_URL}"
  echo "- 実装PR: ${IMP_PR_URL}"
done

# --- Phase 4: 完了報告 ---
echo ""
echo "=== 自動開発が完了しました ==="
echo ""
echo "処理結果: ${COMPLETED}/${TOTAL} 件完了"
```

### 11.3 自動開発コマンド定義の簡素化

`adapters/claude/commands/adev.md` を以下のように全面書き換えする。

```markdown
# /adev - 自動開発コマンド

仕様書のRFC一覧を入力として、RFC作成から実装完了・マージまでを
全自動で順次実行する。

本コマンドは外部シェルスクリプト bin/adev.sh のラッパーである。
OOM 防止のため、RFC 単位で独立した claude プロセスを起動する
設計を採用している。

## 使用方法

ターミナルから以下のコマンドを実行する:

bin/adev.sh <仕様書パス> [セクション名]

- 仕様書パス: 必須。RFC一覧テーブルを含む仕様書のファイルパス
- セクション名: 省略時は "4.3"。RFC一覧テーブルが記載されたセクション

## 動作概要

1. 前提条件ゲート: 仕様書の環境情報と事前タスクを検証
2. RFC slug 一覧の抽出: 仕様書から RFC slug リストを取得
3. RFC 単位の直列ループ:
   - 自動 RFC（/arfc）を実行
   - RFC PR をマージ
   - 自動実装（/aimp）を実行
   - 実装 PR をマージ
4. 決定ログ: 各ステップの結果を記録
5. 失敗時: 即停止（リトライは /arfc・/aimp の自前ループに委ねる）
```

### 単体テスト仕様

| テスト対象 | 検証観点 |
|-----------|----------|
| aimp.md の Verification ループ定義 | Step 1.5-1〜1.5-3 の遷移条件が正しく記述されていること |
| aimp.md の verification_attempts カウンター | 初期値 0、上限 3 の制御が正しいこと |
| bin/adev.sh 引数チェック | 引数なし・存在しないファイル指定でエラー終了すること |
| bin/adev.sh 前提条件ゲート | FAIL 出力時にスクリプトが停止すること |
| bin/adev.sh slug 抽出 | JSON 配列パースが正しく動作すること |
| bin/adev.sh 失敗時即停止 | 各ステップの失敗でループが中断されること |
| bin/adev.sh 決定ログ | 各ステップ完了時にログファイルが更新されること |
| adev.md 簡素化 | Tier 2 リカバリーが削除されていること |
