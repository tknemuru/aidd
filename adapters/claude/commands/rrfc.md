# /rrfc - RFCレビューコマンド

指定されたRFCに対し、2層ゲートキーパー（キーワードスキャン + ゲートキーパー判定）による検証を実行せよ。

## 対象slug

$ARGUMENTS

## 実行手順

### Step 1: slug の取得

上記「対象slug」が空の場合は、「レビュー対象のslugを入力してください。」とだけ表示し、ユーザの次のメッセージを待て。

### Step 2: ブランチ確認

現在のブランチが `rfc/<slug>` であることを確認せよ。異なる場合は `rfc/<slug>` にチェックアウトせよ。

### Step 3: RFC ファイル存在確認

カレントリポジトリのルート（`git rev-parse --show-toplevel`）を基準に `docs/rfcs/<slug>/rfc.md` の存在を確認せよ。ファイルが存在しない場合はエラーを報告して終了せよ。RFC の絶対パスを控えておくこと（Task に渡すため）。

**注意:** RFC本文をここで読み込む必要はない。ゲートキーパー Task が自身で読み込む。

### Step 4: ラウンド判定

`docs/rfcs/<slug>/` 配下の `review-gate-r*.md` ファイル数を確認し、ラウンド番号を自動判定する。

- `review-gate-r*.md` が 0件 → ラウンド1
- `review-gate-r*.md` が N件 → ラウンド N+1

ラウンド番号が 9 以上の場合、
「レビューラウンドが上限（8回）に達しました。
手動で対応してください。」と報告して終了せよ。

### Step 4.3: 仕様書改ざんスキャン

RFC ブランチ上でサービス仕様書がデフォルトブランチから
変更されていないことを検証せよ。

1. デフォルトブランチを検出する:
   ```bash
   DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD \
     2>/dev/null | sed 's@^refs/remotes/origin/@@')
   if [ -z "$DEFAULT_BRANCH" ]; then
     DEFAULT_BRANCH=$(git remote show origin 2>/dev/null \
       | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
   fi
   ```

2. サービス仕様書のパスを Glob で探索する:
   `docs/specs/*/spec.md`
   該当ファイルが存在しない場合はこのステップを PASS とする。

3. 各サービス仕様書に対し差分を検出する:
   ```bash
   git diff origin/<default-branch> -- <spec-path>
   ```
   - 差分が空: PASS
   - 差分が非空: FAIL

4. FAIL の場合:
   - GATE-0 を FAIL としてレビュー結果に記録する
   - FAIL 時の固定対応文を出力する
   - 後続のステップ（キーワードスキャン・ゲートキーパー検証）
     は実行せず、Step 6（結果報告）に進む

### Step 4.5: キーワードスキャン（証拠収集）

RFC 全文に対し、以下の禁止用語スキャンを実施せよ。

禁止用語リスト:

```
mock, stub, spy, fake, jest.fn, vi.fn, MagicMock, monkeypatch,
patch, responses, respx, httpx.MockTransport, unittest.mock,
モック, スタブ, スパイ, Phase, フェーズ, スコープ外,
別RFCで, 将来的に, 今後の課題, MVP,
fallback, フォールバック, default value, デフォルト値,
graceful degradation, 縮退, フェイルセーフ,
.unwrap_or, .unwrap_or_default, .unwrap_or_else,
.getOrDefault, Optional.orElse, rescue nil
```

検出結果は Step 5.5 のキーワード FAIL 上書き処理で使用する。

### Step 5: ゲートキーパー検証実行

以下のプロンプトで Task を起動し、ゲートキーパー検証を実行させよ。

**Task のプロンプトに RFC 本文を埋め込むな。ファイルパスのみ渡し、Task 側で読み込ませること。**

```
あなたはゲートキーパーとして RFC を検証する。
まず以下のファイルを Read ツールで読み込め。

1. 人格定義: {gatekeeper.md の絶対パス}
2. 検証項目: {gate-criteria-rfc.md の絶対パス}
3. 検証対象 RFC: {RFC ファイルの絶対パス}

## 指示
- 人格定義の判定原則に従い、検証項目に定義された
  すべてのゲートを順に検証せよ。
- 各ゲートで基準 A（適合証明）と基準 B（不適合排除）の
  両方を判定せよ。
- 全ゲート PASS の場合のみ最終判定を PASS とせよ。
- 「である」調で記述せよ。
- 結果を {出力先の絶対パス} に Write ツールで書き込め。

## 出力制約
- 人格定義の出力形式テンプレートに厳密に従え。
- Write ツールでファイル書き込み後、テキスト出力は
  最終判定（PASS / FAIL）の1行のみとせよ。
```

出力ファイル: `docs/rfcs/<slug>/review-gate-r{N}.md`

### Step 5.5: キーワード検出による FAIL 上書き

Step 4.5 でキーワードが検出された場合、
以下のキーワード→ゲート対応表に基づき、
該当ゲートの判定を機械的に FAIL に上書きせよ。

上書き時は、該当ゲートの「対応」行のみを
検証項目に定義された「FAIL 時の固定対応文」
テキストで置換する。
NG 行はゲートキーパーの出力をそのまま維持する。

ゲートキーパーが当該ゲートを PASS 判定
している場合は、ゲート全体を以下の形式で
FAIL に上書きする:

## GATE-X: （ゲート名）
**判定: FAIL**
- NG: キーワードスキャンにより検出
- 対応: （検証項目の「FAIL 時の固定対応文」を転記）

ゲートキーパーが当該ゲートを既に FAIL 判定
している場合は、「対応」行のみを
固定対応文で上書きする。

#### キーワード→ゲート対応表

| キーワード群 | 対応ゲート |
|-------------|-----------|
| mock, stub, spy, fake, jest.fn, vi.fn, | GATE-1 |
| MagicMock, monkeypatch, patch, responses, |  |
| respx, httpx.MockTransport, unittest.mock, |  |
| モック, スタブ, スパイ |  |
| Phase, フェーズ, スコープ外, 別RFCで, | GATE-2 |
| 将来的に, 今後の課題, MVP |  |
| fallback, フォールバック, default value, | GATE-4 |
| デフォルト値, graceful degradation, 縮退, |  |
| フェイルセーフ, .unwrap_or, |  |
| .unwrap_or_default, .unwrap_or_else, |  |
| .getOrDefault, Optional.orElse, rescue nil |  |

### Step 6: 結果報告

ゲートキーパーの結果を以下の形式で報告せよ:
- ゲートキーパーの判定（PASS / FAIL）
- 各ゲートの個別判定
- 出力されたレビューファイルのパス

### Step 7: コミット & プッシュ

1. `docs/rfcs/<slug>/review-gate-r{N}.md` をステージングする。
2. コミットメッセージ `docs: add RFC gate review (round {N}) for <slug>` でコミットする。
3. 現在のブランチ（`rfc/<slug>`）をリモートにプッシュする。

### Step 8: PR ステータス更新

ゲートキーパーの判定が **PASS** の場合、以下を実行せよ:
1. `gh pr ready` で Draft PR を Ready 状態にする。
2. `gh pr view --json url --jq '.url'` で PR URL を取得する。
3. 「レビューが PASS しました。PR を Ready にしました。
   人間による最終確認・マージをお願いします。
   PR: {PR URL}」とユーザに報告する。

ゲートキーパーの判定が **FAIL** の場合:
1. PR は Draft のまま維持する。
2. 「FAIL があります。レビュー結果 `docs/rfcs/<slug>/review-gate-r{N}.md` を確認し、`/urfc <slug>` でRFCを修正後に再度 `/rrfc` を実行してください。」とユーザに報告する。
