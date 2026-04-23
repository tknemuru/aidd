# /repo - ドキュメント保存コマンド

会話で議論した内容を `docs/reports/` 配下に Markdown ドキュメントとして保存し、PR を作成する軽量コマンド。AI レビューは不要とし、人間レビューのみの軽量フローで運用する。

## オプション

$ARGUMENTS

- `--merge`: PR 作成後、マージまで自動実行する
- 残りのテキスト: 補足指示（ドキュメント内容に関する追加の指示や文脈）

## 実行手順

### Step 1: 引数解析

1. `$ARGUMENTS` に `--merge` が含まれていればフラグを ON にする。
2. 会話コンテキスト（このコマンド実行前の議論内容）を元ネタとして使用する。

### Step 2: 種別・ファイル名決定

会話コンテキストの内容から適切な種別を判定する。判断基準は以下の通りである。

- 技術調査・分析の議論 → `report`
- セッション引き継ぎ・コンテキスト共有 → `handover`
- 設計判断・技術選定の決定 → `decision`
- 会議・ミーティングの記録 → `minutes`
- 計画・方針の策定 → `roadmap`

JST 日付を取得し、`YYYYMMDD-<type>-<description>.md` 形式でファイル名を生成する。`<description>` は会話内容を要約した英数字ケバブケース文字列とする。

### Step 3: デフォルトブランチ取得・チェックアウト

```bash
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
git checkout "$DEFAULT_BRANCH"
git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
```

### Step 4: ブランチ作成

```bash
git checkout -b "repo/<description>"
```

`<description>` は Step 2 で生成したファイル名の `<description>` 部分を使用する。

### Step 5: README.md 配置

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ ! -f "$REPO_ROOT/docs/reports/README.md" ]; then
  mkdir -p "$REPO_ROOT/docs/reports"
  cp ~/projects/vdev/docs/reports/README.md "$REPO_ROOT/docs/reports/README.md"
fi
```

vdev 以外のリポジトリで初回実行時、vdev から README.md をコピーして命名規則を展開する。

### Step 6: ドキュメント作成

会話コンテキストを構造化した Markdown ドキュメントを作成し、`docs/reports/YYYYMMDD-<type>-<description>.md` に書き込む。ドキュメントの内容は会話の議論結果を忠実に反映する。

### Step 7: コミット・プッシュ

```bash
git add docs/reports/
git commit -m "docs: add <type> <description>"
git push -u origin "repo/<description>"
```

README.md をコピーした場合はそれも含めてコミットする。

### Step 8: PR 作成

```bash
gh pr create \
  --title "docs: add <type> <description>" \
  --body "## Summary

- **種別**: <type>
- **ファイル**: docs/reports/YYYYMMDD-<type>-<description>.md

---
人間によるレビューをお願いします。"
```

Draft PR ではなく通常の PR として作成する（AI レビュー不要のため Ready 状態で作成）。

### Step 9: マージ処理（--merge 時のみ）

```bash
gh pr merge --squash --delete-branch
```

`--merge` フラグが ON でない場合はスキップする。

### Step 10: 完了報告

#### --merge なしの場合

```
ドキュメントを作成し、PRを作成しました。

- **ファイル**: docs/reports/YYYYMMDD-<type>-<description>.md
- **PR**: {PR URL}

人間によるレビュー・マージをお願いします。
```

#### --merge ありの場合

```
ドキュメントを作成し、マージしました。

- **ファイル**: docs/reports/YYYYMMDD-<type>-<description>.md
- **PR**: {PR URL}（マージ済）
```
