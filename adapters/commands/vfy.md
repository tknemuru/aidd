# /vfy - Verification 実行コマンド

実装済みコードに対し、RFC の E2Eテスト仕様に基づく検証を独立して実行する。実装エージェントとは異なるセッションで検証を行うことで、確証バイアスを排除する。

## 対象

$ARGUMENTS

## 実行モード

本コマンドは2つのモードで動作する。`$ARGUMENTS` の内容で自動判定する。

### RFC モード（既定）

`$ARGUMENTS` が slug（例: `20260301-feature-name`）の場合に適用する。個別 RFC の §7 E2Eテスト仕様に基づいて実装を検証する。

### service-spec モード

`$ARGUMENTS` が仕様書パス（例: `/path/to/service-spec.md`）の場合に適用する。仕様書の §2 E2Eテスト要件に基づいてプロダクト全体を検証する。

## 実行手順

### Step 1: 対象の取得とモード判定

上記「対象」が空の場合は、「検証対象のslugまたは仕様書パスを入力してください。」とだけ表示し、ユーザの次のメッセージを待て。

`$ARGUMENTS` がファイルパスとして存在する場合は service-spec モード、それ以外は RFC モードとする。

### Step 2: ブランチ確認

- **RFC モード**: 現在のブランチが `feature/<slug>` であることを確認せよ。異なる場合は `feature/<slug>` にチェックアウトせよ。
- **service-spec モード**: ブランチ確認は行わない（呼び出し元のブランチ上でそのまま実行する）。

### Step 2.5: 仕様改ざんチェック

検証対象の仕様ファイルがデフォルトブランチから
変更されていないことを確認する。

1. デフォルトブランチを検出する:
   ```bash
   DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD \
     2>/dev/null | sed 's@^refs/remotes/origin/@@')
   if [ -z "$DEFAULT_BRANCH" ]; then
     DEFAULT_BRANCH=$(git remote show origin 2>/dev/null \
       | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
   fi
   ```

2. 対象ファイルの差分を検出する:
   - **RFC モード**: `docs/rfcs/<slug>/rfc.md`
   - **service-spec モード**: 指定されたサービス仕様書パス

   ```bash
   git diff origin/<default-branch> -- <target-file>
   ```

3. 差分が存在する場合、即座に停止し
   以下のエスカレーションを行う:
   - ブロッカー: 仕様ファイルがデフォルトブランチから
     変更されている
   - 理由: 承認済み仕様の改ざんの可能性があるため、
     AI が検証を続行することは不適切である
   - 推奨アクション: 差分の内容を確認し、
     意図した変更か改ざんかを人間が判断する
   - 再開条件: 人間が差分を確認し、
     検証続行の承認を得ること

### Step 3: E2Eテスト仕様の読み込み

#### RFC モード

カレントリポジトリのルート（`git rev-parse --show-toplevel`）を基準に、`docs/rfcs/<slug>/rfc.md` を読み込め。RFC ファイルが存在しない場合はエラーを報告して終了せよ。

E2Eテスト仕様（§7）から全テスト項目（ID、対応要件、セットアップ手順、実行手順、期待するアウトカム）を抽出する。

#### service-spec モード

指定された仕様書ファイルを読み込め。ファイルが存在しない場合はエラーを報告して終了せよ。

E2Eテスト要件（§2）から全テスト項目（ID、シナリオ名、前提条件、実行手順、期待結果）を抽出する。

### Step 4: セットアップ検証とテスト充足確認

E2Eテスト仕様に記載された全テストが実装によって充足されているか確認せよ。

1. 各E2Eテスト項目のセットアップ手順が充足されているか確認する（環境変数の存在確認等）。
2. プロジェクトのテストコマンドを実行し、全テストが通過することを確認する。
3. テスト不足・失敗がある場合は FAIL として記録し、Step 5 の検証実行には進まない。FAIL 項目を報告して終了せよ。

### Step 5: E2Eテスト仕様の検証実行

E2Eテスト仕様の各テスト項目を順に実行し、結果を PASS/FAIL + エビデンスとして記録する。

実行ルール:
- E2Eテスト仕様に記載された実行手順を**そのまま実行**せよ。
- 副作用を伴う操作は実行前にユーザに承認を求め、承認を得た上で実行せよ。
- **検証の実行をスキップし、後続の人間作業として残すことは禁止する。** すべての検証はこの Step で完了させること。
- 各テスト項目の実行前に、AI 単独で完遂可能か判定せよ。
  以下に該当する場合は実行に入らずエスカレーションする:
  - 物理デバイスやブラウザ画面の目視確認が必要
  - AI がアクセスできない外部サービスの操作が必要
  - 認証情報の取得・設定が必要

### Step 6: 結果ファイル書き出し

結果を以下のファイルに書き出せ:
- **RFC モード**: `docs/rfcs/<slug>/verification-results.md`
- **service-spec モード**: 仕様書ファイルと同じディレクトリの `verification-results.md`（例: `docs/specs/<slug>/verification-results.md`）

形式:

```markdown
# Verification Results

| ID | 対応要件 | セットアップ手順 | 実行手順 | 期待するアウトカム | 結果 | エビデンス |
|----|----------|------------------|----------|-------------------|------|-----------|
| {ID} | {対応要件} | {セットアップ手順} | {実行手順} | {期待するアウトカム} | PASS / FAIL | {実行コマンドの出力、ファイル該当箇所の引用等} |
```

### Step 7: PR body 更新（RFC モードのみ）

service-spec モードの場合はこのステップをスキップする。

`gh pr edit` で PR body に Verification 結果テーブルを追記せよ。既存の「## Verification Results」セクションがある場合は置換せよ。

```bash
# 現在の PR body を取得
CURRENT_BODY=$(gh pr view --json body --jq '.body')

# Verification 結果セクションを追記または置換
gh pr edit --body "{更新後の body}"
```

### Step 8: コミット & プッシュ（RFC モードのみ）

service-spec モードの場合はこのステップをスキップする。

1. `docs/rfcs/<slug>/verification-results.md` をステージングする。
2. コミットメッセージ: `docs: add verification results for <slug>`
3. `feature/<slug>` ブランチをリモートにプッシュする。

### Step 9: 結果報告

- 全 PASS の場合: 「全テスト項目が PASS しました。」と報告する。
- FAIL がある場合: FAIL 項目を一覧表示し、「FAIL の項目を修正後、再検証を実行してください。」と報告する。
