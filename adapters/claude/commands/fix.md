# /fix - 軽量実装コマンド

RFC作成→自動マージ→実装→PR作成までを一気通貫で実行する軽量パス。AIレビューは省略する。メインエージェントは薄いオーケストレータとして振る舞い、RFC作成は `/rfc`、実装は `/imp` を Task 経由で内部呼び出しする。

## オプション

$ARGUMENTS

- `--merge`: 実装PRも自動マージまで進める（人間レビューをスキップ）

## 実行手順

### Step 1: 入力解析

1. `$ARGUMENTS` に `--merge` が含まれていればフラグを ON にする。
2. このコマンドの実行前の会話コンテキスト（ユーザとの議論内容）を元ネタ文章として使用する。会話コンテキストから、実装すべき内容・背景・要件を要約せよ。

### Phase 1: RFC作成

会話コンテキストから要約した元ネタ文章を用いて、以下のプロンプトで Task を起動し、RFCを作成させよ。

```
以下のコマンド定義を読み込み、その手順に従って RFC を作成せよ。
- コマンド定義: ~/projects/vdev/adapters/claude/commands/rfc.md

$ARGUMENTS の値は以下の元ネタ文章として扱え:
{会話コンテキストから要約した元ネタ文章をここに埋め込む}
```

Task の結果から `slug` と RFC PR URL を取得し、以降のステップで使用する。

### Phase 2: RFC PR 自動マージ

RFC PRをレビューなしで即座にマージする。

#### Step 2-1: RFC ステータス更新

`docs/rfcs/<slug>/rfc.md` を読み込み、ステータスを「Accepted (承認済)」に更新して書き込む。

#### Step 2-2: コミット・プッシュ

```bash
git add docs/rfcs/<slug>/rfc.md
git commit -m "docs: accept RFC for <slug>"
git push origin rfc/<slug>
```

#### Step 2-3: PR マージ

```bash
gh pr ready
gh pr merge --squash --delete-branch
```

### Phase 3: 実装

以下のプロンプトで Task を起動し、実装を実行させよ。

```
以下のコマンド定義を読み込み、その手順に従って実装を行え。
- コマンド定義: ~/projects/vdev/adapters/claude/commands/imp.md

$ARGUMENTS の値は「{slug}」として扱え。
```

Task の結果から実装 PR URL を取得する。

### Phase 4: 完了処理

#### --merge なしの場合

実装PRをReadyにする。

```bash
gh pr ready
```

以下をユーザに報告せよ:

```
実装が完了しました。

- **RFC PR**: {RFC PR URL}（マージ済）
- **実装PR**: {実装PR URL}

人間による最終確認・マージをお願いします。
```

#### --merge ありの場合

実装PRをReadyにしてスカッシュマージする。

```bash
gh pr ready
gh pr merge --squash --delete-branch
```

以下をユーザに報告せよ:

```
実装が完了し、マージしました。

- **RFC PR**: {RFC PR URL}（マージ済）
- **実装PR**: {実装PR URL}（マージ済）
```
