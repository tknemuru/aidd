# /upr - PRコメント対応コマンド

人間による PR レビューコメントに基づき、RFC・コード・サービス仕様書を修正せよ。

## 対象slug

$ARGUMENTS

## 実行手順

### Step 1: slug の取得

上記「対象slug」が空の場合は、「対象のslugを入力してください。」とだけ表示し、ユーザの次のメッセージを待て。

### Step 2: ブランチ確認と PR タイプ判定

現在のブランチ名から PR タイプを判定せよ:

1. `feature/<slug>` → **実装 PR**
2. `rfc/<slug>` → **RFC PR**
3. `docs/spec-<slug>` → **Spec PR**
4. いずれでもない場合 → `feature/<slug>`, `rfc/<slug>`, `docs/spec-<slug>` の各ブランチの存在をリモートで確認し、ユーザに選択させる。1つのみ存在する場合はそのブランチを使用する。

該当ブランチにチェックアウトせよ。以降の手順では、ここで判定した PR タイプに応じて分岐する。

### Step 3: PR コメント取得

`gh` CLI を使用して、対象ブランチの PR コメントを取得せよ。ブランチ名は Step 2 で判定した PR タイプに応じたブランチを使用する。

一般コメントとレビューコメント（インラインコメント）の両方を取得すること:

```bash
# BRANCH は feature/<slug>, rfc/<slug>, または docs/spec-<slug>

# PR 番号を取得
PR_NUMBER=$(gh pr view $BRANCH --json number --jq '.number')

# 一般コメント（Conversation タブ）
gh pr view $BRANCH --comments --json comments

# レビューコメント（インラインコメント）
gh api repos/{owner}/{repo}/pulls/$PR_NUMBER/comments
```

コメントが存在しない場合は「対応すべき PR コメントはありません。」と報告して終了せよ。

### Step 4: 関連情報の読み込み

カレントリポジトリのルート（`git rev-parse --show-toplevel`）を基準に、PR タイプに応じた情報を**並列に（単一メッセージ内で同時に）**読み込め。

#### 実装 PR の場合

- `docs/rfcs/<slug>/rfc.md` を読み込む（RFC本文）
- 実装差分を取得する（以下のコマンド。レビュー関連ファイルを除外する）

```bash
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
git diff "$DEFAULT_BRANCH"...HEAD -- . ':!docs/rfcs/*/review-*.md'
```

#### RFC PR の場合

- `docs/rfcs/<slug>/rfc.md` を読み込む（RFC本文）
- RFC 差分を取得する

```bash
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
git diff "$DEFAULT_BRANCH"...HEAD -- docs/rfcs/<slug>/
```

#### Spec PR の場合

ブランチ名 `docs/spec-<slug>` から `<slug>` を抽出し、`docs/specs/<slug>/spec.md` を読み込む（サービス仕様書本文）。

- Spec 差分を取得する

```bash
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
git diff "$DEFAULT_BRANCH"...HEAD -- docs/specs/<slug>/
```

### Step 5: コメントトリアージ

PR コメントを以下の3カテゴリに分類せよ:

| カテゴリ | 判定基準 | 対応 |
|---|---|---|
| **A: 即時修正** | 対応要否が明確な指摘、軽微な修正（typo、命名、フォーマット等） | そのまま修正する |
| **B: 要ディスカッション** | 相談ベースのコメント、設計判断を伴うもの、複数の解釈がありうるもの | 推奨する対応案を理由とともに提示し、ユーザの承認を得て対応を決定する |
| **C: 質問・確認** | 実装意図の質問、仕様確認、情報提供の依頼 | 回答のみ（コード変更なし） |

**判定に迷った場合はカテゴリ B に倒すこと。** 勝手に判断して修正してはならない。

分類結果を以下の形式でユーザに提示し、カテゴリの修正がないか確認を取ること:

```
## コメントトリアージ結果

### カテゴリ A: 即時修正
- [コメント要旨] → [予定する対応]
- ...

### カテゴリ B: 要ディスカッション
- [コメント要旨] → [論点の整理]
- ...

### カテゴリ C: 質問・確認
- [コメント要旨] → [回答案]
- ...

カテゴリの変更があれば指示してください。なければこのまま進めます。
```

ユーザの承認を得てから次のステップに進むこと。

### Step 6: カテゴリ B/C の対話と PR コメント返信

カテゴリ B および C のコメントについて、以下の手順で対応せよ:

1. **ユーザと terminal 上で対話する。** 各コメントについて推奨する対応を理由とともに提示し、ユーザの承認または修正を受ける。
2. **対話で合意した内容を PR コメントに返信として投稿する。**

返信方法はコメント種別に応じて分岐する:

#### Review Comment（インラインコメント）の場合 → スレッド返信

```bash
gh api repos/{owner}/{repo}/pulls/{pull_number}/comments/{comment_id}/replies \
  -X POST -f body="返信内容"
```

#### 一般コメント（Conversation タブ）の場合 → 引用付き新規コメント

一般コメントにはスレッド返信の API が存在しないため、元コメントを引用した新規コメントとして投稿する:

```bash
gh pr comment {pr_number} --body "> 元コメントの引用

返信内容"
```

3. **カテゴリ B で修正が必要と合意されたものはカテゴリ A に移行し、Step 7 で修正する。**

### Step 7: 修正

1. `.claude/prompts/roles/rfc-author.md` を読み込み、RFC 修正時はその人格に従う。
2. カテゴリ A（当初の A + カテゴリ B から昇格したもの）の指摘に対して修正を行う。

#### 実装 PR の場合

   - RFC に対する指摘 → `docs/rfcs/<slug>/rfc.md` を修正
   - コードに対する指摘 → 該当ソースコードを修正
   - テストコードの修正・追加が必要な場合は対応する

#### RFC PR の場合

   - `docs/rfcs/<slug>/rfc.md` を修正する

#### Spec PR の場合

   - `docs/specs/<slug>/spec.md` を修正する

3. RFC の設計意図を維持しつつ指摘を反映すること。

### Step 8: 対応結果サマリの PR 投稿

全コメントへの対応完了後、対応結果のサマリを PR の一般コメントとして投稿せよ:

```bash
gh pr comment {pr_number} --body "## PR Review 対応サマリ

### 修正対応（カテゴリ A）
- [コメント要旨] → [対応内容]

### ディスカッション結果（カテゴリ B）
- [コメント要旨] → [合意内容と対応]

### 回答済み（カテゴリ C）
- [質問要旨] → [回答要旨]"
```

該当がないカテゴリのセクションは省略してよい。

### Step 9: テスト実行

実装 PR でコードを修正した場合は、プロジェクトのテストコマンドを実行し全て通過することを確認せよ。RFC PR・Spec PR の場合はこのステップをスキップする。

### Step 10: コミット & プッシュ

1. 変更ファイルをステージングする。
2. コミットメッセージは変更内容に応じた適切なプレフィックス（`fix:`, `refactor:`, `docs:` 等）を付けること。
3. 対象ブランチ（`feature/<slug>`, `rfc/<slug>`, または `docs/spec-<slug>`）をリモートにプッシュする。
4. 修正内容の要約と PR URL をユーザに報告せよ。
