# [RFC] オーケストレータのフェーズ再判定による冪等性保証

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | Claude (RFC Author) |
| **ステータス** | Accepted (承認済) |
| **作成日** | 2026-03-10 |
| **タグ** | bugfix, adev, idempotency |
| **関連リンク** | - |

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

## 0. 絶対守ること

<!-- 本セクションは人間のみが記述する。AI は空欄のまま残すこと。 -->

## 1. 背景・動機 (Motivation)

<!-- 散文で記述。ただし5文以内。 -->

自動開発オーケストレータはエスカレーション後の再起動時に同一フェーズマップを再利用するが、フェーズマップは初回起動時の静的スナップショットであるため、実際の進捗状態と乖離する。この乖離により、完了済みフェーズの再実行や日付プレフィクスの二重付与が発生する。根本原因はオーケストレータがランタイムの成果物状態を確認せず、静的なフェーズマップを盲信していることにある。

## 2. 機能要件

### 達成すべき要件

<!-- コード識別子禁止。機能名称またはドメイン用語で記述。 -->

| ID | 要件 |
|----|------|
| F-1 | 成果物の実状態からフェーズを再判定する関数を追加する |
| F-2 | フェーズ再判定は終端から逆順に8段階で判定する |
| F-3 | slug 解決済みの場合にフェーズ再判定を実行する |
| F-4 | 再判定結果がフェーズマップより進んでいる場合スキップする |
| F-5 | RFC 初期化への入力から日付プレフィクスを防御的に除去する |

### やらないこと

- フェーズマップ JSON の構造変更
- コマンド定義側のフェーズ判定ロジック変更
- オーケストレータの全体構造の変更

## 3. 非機能要件

### 達成すべき要件

| ID | 分類 | 要件 |
|----|------|------|
| NF-1 | 冪等性 | 同一フェーズマップでの再起動が安全に動作する |
| NF-2 | 互換性 | 初回起動時の動作が変わらない |
| NF-3 | 信頼性 | 判定不能な場合は安全側（再実行側）に倒す |

### やらないこと

- フェーズマップの動的更新機構
- 再起動専用の別コマンド追加

## 4. 実現方式

<!-- 機能要件・非機能要件をどう実現するかの高レベル方針。 -->

| 要件 | 実現方式 |
|------|----------|
| F-1 フェーズ再判定関数 | ブランチ存在・PR 状態・レビューファイルの実在を検査する関数を追加 |
| F-2 8段階逆順判定 | コマンド定義のフェーズ判定と同一ロジックを関数内に実装 |
| F-3 条件付き再判定 | slug 解決で名前が変化した場合のみ再判定を実行 |
| F-4 フェーズ比較とスキップ | フェーズに序数を割り当て、数値比較でスキップを判定 |
| F-5 日付プレフィクス除去 | RFC フェーズの入力を正規表現で防御的にサニタイズ |
| NF-1 冪等性 | 再判定により完了済みフェーズを自動スキップ |
| NF-2 互換性 | 未解決 slug では再判定を実行しないため初回動作に影響なし |
| NF-3 安全側倒し | レビューファイルの判定不能時はレビュー再実行側に倒す |

## 5. 代替案の検討

<!-- §4の実現方式に対する代替案。最低2案を比較。 -->

| 案 | 概要 | 採否 | 決定的理由 |
|----|------|------|------------|
| A: ランタイム再判定 | slug ループ冒頭で成果物から現在フェーズを再判定する | **採用** | フェーズマップの変更不要で既存構造との親和性が高い |
| B: フェーズマップ動的更新 | 各フェーズ完了時にフェーズマップ JSON を書き換える | 却下 | ファイル I/O の競合リスクがあり、異常終了時に不整合が残る |
| C: 状態管理データベース導入 | SQLite 等で進捗状態を永続化する | 却下 | シェルスクリプトの複雑度が大幅に増し、依存も増える |

## 6. 外部仕様 (External Specification)

<!-- ユーザ・運用者視点の振る舞い。箇条書き＋コード例。 -->

- オーケストレータの利用者から見た動作は変わらない
- エスカレーション後の再起動で以下が改善される
  - 完了済みフェーズが自動的にスキップされる
  - 日付プレフィクスの二重付与が発生しない
- ログ出力にフェーズスキップの旨が追記される
  - 例: `[slug] フェーズ再判定: RFC → IMP（スキップ）`

## 7. E2Eテスト仕様

<!-- E2E テスト設計は
gate-criteria-rfc.md GATE-1 基準B に従うこと -->

| ID | 対応要件 | セットアップ手順 | 実行手順 | 期待するアウトカム |
|----|----------|------------------|----------|-------------------|
| E-1 | F-1, F-2 | `git show-ref`・`gh pr list`・レビューファイルを返すシェル関数をテスト用に差し替える。MERGED 状態の PR を模擬する | フェーズ再判定関数を呼び出す | DONE が返される |
| E-2 | F-1, F-2 | レビューゲートファイルに「最終判定.*PASS」を含むファイルをテスト用ディレクトリに配置する | フェーズ再判定関数を呼び出す | MERGE_RFC が返される |
| E-3 | F-1, F-2, NF-3 | ブランチもPRもレビューファイルも存在しない状態を模擬する | フェーズ再判定関数を呼び出す | RFC が返される |
| E-4 | F-3, F-4 | slug 解決で名前変化する slug を用意し、実状態を IMP に設定する | フェーズマップの phase が RFC の状態で slug ループを実行する | RFC フェーズがスキップされ IMP から開始される |
| E-5 | F-5 | 日付プレフィクス付き slug を用意する | RFC フェーズで RFC 初期化に渡される slug を確認する | 日付プレフィクスが除去された slugstr が渡される |
| E-6 | F-5 | 日付プレフィクスなしの slug を用意する | RFC フェーズで RFC 初期化に渡される slug を確認する | slug がそのまま渡される（除去処理で副作用なし） |
| E-7 | NF-1 | 全フェーズが DONE の slug を持つフェーズマップを用意する | オーケストレータを実行する | 全 slug がスキップされ正常終了する |
| E-8 | NF-2 | 未解決（新規）の slug を持つフェーズマップを用意する | オーケストレータを実行する | 再判定が実行されず通常通り RFC フェーズから開始される |

## 8. ドキュメント編集仕様

<!-- システム概要ドキュメント等の作成・更新・削除。 -->

| 対象ファイル | 操作 | 変更内容 |
|-------------|------|----------|
| なし | - | システム概要ドキュメントへの影響なし |

## 9. Task計画

<!-- 作業分割は
gate-criteria-rfc.md GATE-2 基準B に従うこと -->
<!-- 全作業項目は単一のPRで完遂すること。 -->
<!-- §7 のセットアップ手順に記載した環境準備は本セクションに「セットアップ」種別のタスクとして含めること。 -->

| # | 種別 | 作業内容 | 依存 |
|---|------|----------|------|
| 1 | コード | フェーズ序数変換関数を追加する | - |
| 2 | コード | フェーズ再判定関数を追加する | 1 |
| 3 | コード | slug ループに再判定・スキップロジックを組み込む | 2 |
| 4 | コード | RFC フェーズの日付プレフィクス除去を追加する | - |
| 5 | テスト | フェーズ再判定関数の単体テストを追加する | 2 |
| 6 | テスト | slug ループのスキップ動作・日付除去のテストを追加する | 3, 4 |

### ロールバック基準と手順

- 再起動時に完了済みフェーズの再実行が発生した場合
- `git revert` でオーケストレータを修正前に戻す

## 10. 前提条件・依存関係

| 種別 | 内容 |
|------|------|
| 前提 | コマンド定義のフェーズ判定ロジックが正しいこと |
| 前提 | `gh` CLI が利用可能であること |
| 依存 | git-utils.sh の `get_pr_status` 関数 |
| 依存 | `git show-ref` コマンドの利用可能性 |

## 11. 詳細設計 (Detailed Design)

<!-- 箇条書き＋コード例。 -->
<!-- コードブロック間補足は2文以内の散文許可。 -->

- `bin/adev.sh` に以下の3つの関数と slug ループの修正を追加する

### フェーズ序数変換関数

フェーズ文字列を序数に変換し、比較を可能にする。

```bash
# フェーズ文字列を序数に変換する
#
# 引数:
#   $1: フェーズ文字列
#
# 戻り値:
#   標準出力に序数（0-8）を出力
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
```

### フェーズ再判定関数

成果物の実状態から現在のフェーズを判定する。コマンド定義の Step 1-5 と同一の判定ロジックを実装する。

```bash
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
```

### slug ループの修正

slug ループ冒頭に再判定ロジックを追加する。

```bash
while read -r entry; do
  raw_slug=$(echo "$entry" | jq -r '.slug')
  phase=$(echo "$entry" | jq -r '.phase')
  slug="$raw_slug"

  # 仕様書の slug を完全 slug に解決
  if [ ! -d "$REPO_ROOT/docs/rfcs/${slug}" ]; then
    resolved_dir=$(find "$REPO_ROOT/docs/rfcs" -maxdepth 1 \
      -type d -name "*-${slug}" 2>/dev/null | head -1)
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
  # ... 以降の処理は既存と同一
```

### RFC フェーズの日付プレフィクス除去

RFC フェーズで `rfc-init` に渡す前に日付プレフィクスを防御的に除去する。

```bash
  if [ "$phase" = "RFC" ]; then
    # 日付プレフィクスを防御的に除去
    slugstr=$(echo "$slug" | sed 's/^[0-9]\{8\}-//')
    echo "[${slug}] rfc-init 実行中..."
    slug=$(rfc-init "$slugstr") || {
      # ... エラー処理
    }
    # ... 以降の処理
```

### 単体テスト仕様

| テスト対象 | 検証観点 |
|-----------|----------|
| フェーズ序数変換 | 全8フェーズが正しい序数を返すこと |
| フェーズ序数変換 | 不明なフェーズに対して 0 を返すこと |
| フェーズ再判定（DONE） | feature PR が MERGED の場合に DONE を返すこと |
| フェーズ再判定（MERGE_IMPL） | review-vfy ファイルが PASS の場合に MERGE_IMPL を返すこと |
| フェーズ再判定（VFY） | review-impl ファイルが PASS の場合に VFY を返すこと |
| フェーズ再判定（RIMP） | feature ブランチが存在する場合に RIMP を返すこと |
| フェーズ再判定（IMP） | rfc PR が MERGED の場合に IMP を返すこと |
| フェーズ再判定（MERGE_RFC） | review-gate ファイルが PASS の場合に MERGE_RFC を返すこと |
| フェーズ再判定（RRFC） | rfc ブランチが存在する場合に RRFC を返すこと |
| フェーズ再判定（RFC） | 成果物が存在しない場合に RFC を返すこと |
| フェーズスキップ | 再判定結果がマップより進んでいる場合にスキップされること |
| フェーズスキップ | 再判定結果がマップと同じ場合にスキップされないこと |
| 日付プレフィクス除去 | 日付付き slug から日付が除去されること |
| 日付プレフィクス除去 | 日付なし slug がそのまま渡されること |
