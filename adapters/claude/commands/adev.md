# /adev - 自動開発コマンド

仕様書のRFC一覧を入力として、RFC作成から実装完了・マージまでを
全自動で順次実行する。

本コマンドは外部シェルスクリプト bin/adev.sh のラッパーであり、
オーケストレータをバックグラウンドで起動して進捗をリアルタイムに
モニタリングする。

## 使用方法

```
/adev <仕様書パス> [セクション名]
```

- 仕様書パス: 必須。RFC一覧テーブルを含む仕様書のファイルパス
- セクション名: 省略時は "4.3"。RFC一覧テーブルが記載されたセクション

## Phase 1: 初期化

### 1-1. 引数の取得

$ARGUMENTS から仕様書パスとセクション名を取得する。セクション名が省略された場合は "4.3" を使用する。

### 1-2. 仕様書の読み込みとリスクレベル取得

仕様書を Read で読み込み、§0.5 からリスクレベルを取得する。
リスクレベルが未記入の場合はエラーを報告して終了する。

### 1-3. slug 一覧抽出

指定セクション（既定 §4.3）から RFC slug 一覧を抽出する。

### 1-4. 前提条件ゲート

§4.1（必要な環境情報）と §4.2（事前の人間タスク）を
検証する。未充足項目がある場合はエラーを報告して終了する。

### 1-5. フェーズ判定

#### slug 解決

仕様書の slug は日付プレフィクスを持たない（例: `factory-foundation`）。
実際のブランチ・ディレクトリには日付プレフィクスが付与される
（例: `20260309-factory-foundation`）。

各 slug について、以下のパターンで完全 slug への解決を試みる:
- ブランチ: `rfc/*-<slug>` または `feature/*-<slug>`
- ディレクトリ: `docs/rfcs/*-<slug>/`

マッチした場合、以降のフェーズ判定・フェーズテーブル・
フェーズマップ JSON ではマッチした完全名を使用する。
マッチがない場合（新規 RFC）は仕様書の slug をそのまま使用する。

#### 状態チェック

以下のシェルコマンドで各 slug の状態を機械的にチェックする:

```bash
git branch -a | grep -E '(rfc|feature)/'
gh pr list --state all --limit 100 --json headRefName,state
ls docs/rfcs/*/review-gate-r*.md 2>/dev/null
ls docs/rfcs/*/review-impl-r*.md 2>/dev/null
ls docs/rfcs/*/review-vfy-r*.md 2>/dev/null
```

判定は終端（DONE）から逆順にチェックする:

1. feature/<slug> の PR が MERGED → DONE
2. 最新 review-vfy-r*.md が PASS → MERGE_IMPL
3. 最新 review-impl-r*.md が PASS → VFY
4. feature/<slug> ブランチまたは PR が存在 → RIMP
5. rfc/<slug> の PR が MERGED → IMP
6. 最新 review-gate-r*.md が PASS → MERGE_RFC
7. rfc/<slug> ブランチまたは PR が存在 → RRFC
8. 上記いずれにも該当しない → RFC

安全側倒し: レビュー結果ファイルの PASS/FAIL が
判定不能な場合は、再レビュー側（RRFC / RIMP）に倒す。

### 1-6. フェーズテーブル表示と承認

以下の形式でフェーズテーブルをユーザに提示する:

| # | slug | phase | 開始コマンド |
|---|------|-------|-------------|
| 1 | {slug} | {phase} | {command} |

「上記フェーズ判定で正しいですか？
承認する場合は続行を指示してください。」と表示する。

### 1-7. フェーズマップ JSON 生成

承認後、以下の形式でフェーズマップ JSON を
一時ファイルに書き出す:

```json
{
  "risk_level": "{high|medium|low}",
  "slugs": [
    { "slug": "{slug}", "phase": "{phase}" }
  ]
}
```

### 1-8. リポジトリ固有監視ルールの読み込み

対象リポジトリの `.claude/monitors/adev.md` が存在する場合は Read で読み込み、Phase 3 のポーリングループで追加の監視指示として従え。ファイルが存在しない場合はエラーにせず、追加監視なしで通常動作を継続する。

## Phase 2: バックグラウンド起動

オーケストレータをシェルレベルでバックグラウンド実行し、PID とログパスを記録する。

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="/tmp/adev-${TIMESTAMP}.log"
nohup ~/projects/vdev/bin/adev.sh "$SPEC_PATH" "$PHASE_MAP_FILE" \
  > "$LOG_FILE" 2>&1 &
ADEV_PID=$!
echo "PID: $ADEV_PID, Log: $LOG_FILE"
```

起動結果（PID、ログファイルパス）をユーザに報告する。

## Phase 3: モニタリングループ

オーケストレータの終了までポーリングを繰り返す。各サイクルで以下を実行する。

### 3-1. 診断データの収集

```bash
# プロセス生存確認
kill -0 $ADEV_PID 2>/dev/null

# ログ末尾確認
tail -20 "$LOG_FILE"

# 決定ログ末尾確認（パスは仕様書ディレクトリ内の adev-decisions.md）
tail -10 "<spec-dir>/adev-decisions.md"

# git/GitHub 状態確認
git log --oneline -5
git branch -a | grep -E '(rfc|feature)/'
gh pr list --state all --limit 20
```

### 3-2. 状態変化の検知

以下のいずれかに該当する場合を「状態変化あり」と判定する:

- slug のフェーズが前回と異なる値に遷移した
- 新しいコミットが出現した（`git log` の HEAD ハッシュが変化）
- 新しい PR が作成またはマージされた
- 新しいファイルが出現した

### 3-3. リポジトリ固有監視ルールの実行

Phase 1-4 で読み込んだ監視ルールがある場合、ポーリングサイクルごとにその指示に従って追加の監視チェックを実行する。

### 3-4. 報告

| 状況 | 報告内容 |
|------|---------|
| 状態変化あり | 具体値（コミットハッシュ、PR番号、ファイル数等）を含む詳細報告 |
| フェーズ遷移あり | 全 slug の進捗テーブルを表示 |
| 状態変化なし | 「変化なし、次回確認まで N 秒」の簡潔報告 |
| 異常終了検知 | ログ末尾を表示して監視を終了 |

### 3-5. 適応型ポーリング間隔

無変化の連続回数に応じてポーリング間隔を調整する。状態変化を検知した場合はカウンタをリセットする。

| 無変化連続回数 | ポーリング間隔 |
|--------------|--------------|
| 0（初回/状態変化直後） | 60秒 |
| 1 | 120秒 |
| 2 | 180秒 |
| 3以上 | 300秒（上限） |

```
no_change_count = 0

loop:
  collect diagnostic data (3-1)
  detect state changes (3-2)
  run repository-specific monitors (3-3)

  if state changed:
    no_change_count = 0
    report detailed changes (3-4)
  else:
    no_change_count += 1
    report brief status (3-4)

  interval = lookup(no_change_count)
    0     -> 60s
    1     -> 120s
    2     -> 180s
    >= 3  -> 300s

  sleep $interval
  if process exited: break
```

### 3-6. エスカレーション検知（プロセス終了時）

プロセスが終了した場合、終了コードに応じて以下の処理を行う。

- **終了コード 2（エスカレーション）の場合**:
  1. ログファイルから `ESCALATION_REQUIRED` 以降の行を抽出する
     ```bash
     grep -A 4 "ESCALATION_REQUIRED" "$LOG_FILE" | tail -5
     ```
  2. エスカレーション内容をユーザに提示する
  3. ユーザの対応完了を待つ（「対応が完了したら入力してください」と表示）
  4. ユーザが対応完了を報告した後、オーケストレータを再起動する
     （冪等性により完了済み slug はスキップされる）
     ```bash
     nohup ~/projects/vdev/bin/adev.sh "$SPEC_PATH" "$PHASE_MAP_FILE" \
       > "$LOG_FILE" 2>&1 &
     ADEV_PID=$!
     ```
  5. モニタリングループを再開する
- **終了コード 1（エラー）の場合**: 従来通りエラーとして報告する
- **終了コード 0（正常完了）の場合**: 正常完了として Phase 4 に進む

### 3-7. プロセス強制停止（異常検知時）

監視ルールによる異常検知やその他の理由でプロセスを強制停止する必要がある場合は、プロセスグループごと停止する。

```bash
kill -- -$(ps -o pgid= -p $ADEV_PID | tr -d ' ')
```

## Phase 4: 完了レポート

オーケストレータの正常終了（終了コード 0）後、以下を実行する。

1. オーケストレータの終了コードを確認する
2. 全 slug の最終フェーズ判定を行い、進捗テーブルを表示する
3. 成功（全 slug が「完了」フェーズ）または失敗（それ以外）をユーザに報告する
