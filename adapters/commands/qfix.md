# /qfix - 超軽量実装コマンド

RFCを作成せず、会話コンテキストから直接実装を行う超軽量パス。
PRはスカッシュマージまで自動実行する。

## オプション

$ARGUMENTS

## 実行手順

### Step 1: 会話コンテキストの要約

1. このコマンドの実行前の会話コンテキスト（ユーザとの議論内容）を元ネタとして使用する。`$ARGUMENTS` があればそれを補足指示として扱う。
2. 会話コンテキストから以下を要約する:
   - 実装すべき内容
   - 背景・動機
   - 技術的要件
3. slug を生成する。`YYYYMMDD-<slugstr>` 形式とし、`slugstr` は最大30文字の全小文字ケバブケース英数字とする。JST 日付を使用する。

### Step 2: ブランチ作成

デフォルトブランチから `feature/<slug>` ブランチを作成する。

```bash
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
git checkout "$DEFAULT_BRANCH"
git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
git checkout -b "feature/<slug>"
```

### Step 3: System Overview Docs 参照・実装

1. カレントリポジトリのルート（`git rev-parse --show-toplevel`）を基準に、以下の System Overview Docs が存在する場合は**並列に（単一メッセージ内で同時に）**読み込む（存在しないファイルはスキップ）:
   - `docs/architecture.md`
   - `docs/domain-model.md`
   - `docs/api-overview.md`

2. 読み込んだドメイン知識と会話コンテキストの要約に基づき、直接コード改修を実施する。テスト方針（`rules/testing-policy.md`）に基づきテストの要否を判断する。

### Step 4: コミット・プッシュ・PR作成

```bash
git add <変更ファイル>
git commit -m "<prefix>: <変更内容の要約>"
git push -u origin "feature/<slug>"
gh pr create \
  --title "<prefix>: <変更内容の要約>" \
  --body "## Summary

<会話コンテキストから要約した実装内容>

- **Branch**: \`feature/<slug>\`"
```

コミットメッセージのプレフィックスは変更内容に応じて `feat:`, `fix:`, `refactor:`, `docs:` 等を使用する。

### Step 5: スカッシュマージ・完了報告

```bash
gh pr merge --squash --delete-branch
```

完了報告:

```
実装が完了し、マージしました。

- **PR**: {PR URL}（マージ済）
```
