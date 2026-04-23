# [RFC] /qfix 超軽量実装コマンドの新規作成

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | AI (Claude) |
| **ステータス** | Accepted (承認済) |
| **作成日** | 2026-02-10 |
| **タグ** | workflow, command |
| **関連リンク** | `adapters/claude/commands/fix.md`, `workflow/rfc-driven.md` |

## 1. 要約 (Summary)

- RFC作成を省略し、会話コンテキストから直接実装を行う超軽量コマンド `/qfix` を新規作成する。
- GitHub Flow に従い `feature/<slug>` ブランチ1本のみで運用し、PR作成からスカッシュマージまでを自動実行する。
- 既存の `/fix` コマンドとは独立した別コマンドとして実装する。`/fix` が RFC作成+自動マージ+実装+PR作成の一気通貫フローであるのに対し、`/qfix` は RFC を一切作成せず、PR も1本のみ、常に自動マージまで行うという本質的に異なるワークフローを持つ。
- ワークフロー定義（`workflow/rfc-driven.md`）の「No RFC, No Code」原則に対する意図的な例外として、`/qfix` の位置づけを明記する。

## 2. 背景・動機 (Motivation)

- 現行のワークフローでは、どんな小さな変更であっても `/rfc` → `/imp` のフルサイクル、または `/fix` による RFC自動作成+実装の軽量フローを経る必要がある。1行の設定変更やタイポ修正、既に会話で合意済みの軽微な改修に対して RFC を起草するオーバーヘッドは、生産性を不必要に阻害している。
- `/fix` コマンドは「軽量」を謳うが、内部で `/rfc` と `/imp` を Task として順次呼び出しており、RFC の起草・テンプレート埋め・ブランチ作成・PR作成を2回（RFC用とimpl用）行う。会話で既に背景・要件・設計方針が合意されている場合、RFC の形式的な起草は情報の重複でしかない。
- `/fix` のオプション（例: `--no-rfc`）として実装する案もあるが、RFC なし・PR 1本・常に自動マージという `/qfix` のワークフローは `/fix` とは本質的に異なる。オプションによる条件分岐は `/fix` の可読性と保守性を低下させるため、独立コマンドとして作成すべきである。

## 3. 目的とスコープ (Goals & Non-Goals)

### 目的 (Goals)

| # | Goal | 達成確認方法 (Verification) |
|---|------|-----------------------------|
| G1 | `adapters/claude/commands/qfix.md` が作成され、会話コンテキストからの要約→ブランチ作成→実装→コミット→PR作成→スカッシュマージ→完了報告の手順が定義されていること | `adapters/claude/commands/qfix.md` を Read で読み込み、上記の各ステップ（Step 1〜5）が順序通りに記述されており、RFC 作成ステップが存在しないことを確認する |
| G2 | `workflow/rfc-driven.md` に `/qfix` が「No RFC, No Code」原則の意図的例外として記載されていること | `workflow/rfc-driven.md` を Read で読み込み、`/qfix` への言及と例外としての位置づけの記述が存在することを確認する |
| G3 | `/qfix` コマンドのブランチ戦略が `feature/<slug>` 1本であり、PR は1つだけ作成されること | `adapters/claude/commands/qfix.md` を Read で読み込み、ブランチ名が `feature/` プレフィックスであること、PR 作成が1回のみであること、RFC用ブランチ・PRの記述が存在しないことを確認する |
| G4 | `/qfix` コマンドが常にスカッシュマージまで自動実行し、完了報告に PR URL を含むこと | `adapters/claude/commands/qfix.md` を Read で読み込み、`gh pr merge --squash --delete-branch` コマンドが無条件に実行される記述と、完了報告テンプレートに PR URL が含まれることを確認する |

### やらないこと (Non-Goals)

- `/fix` コマンドの変更は行わない。`/qfix` は完全に独立した新規コマンドである。
- テスト・レビューの自動実行は `/qfix` のスコープ外とする。超軽量を旨とし、実装後の検証は含めない。
- シェルスクリプト（`rfc-init` 等）の新規作成は行わない。`/qfix` はコマンド定義ファイル内の bash コマンド記述で完結する。

## 4. テスト戦略 (Test Strategy)

- 対象が Markdown コマンド定義ファイル（`qfix.md`）と Markdown ワークフロー定義ファイル（`rfc-driven.md`）のみであるため、自動テストの対象外である。
- 検証方法: Goals テーブルの Verification に記載した手順（各ファイルの Read による内容確認）で検証する。

## 5. 横断的関心事 (Cross-Cutting Concerns)

<!-- 該当するサブセクションのみ記載せよ。該当しないものは削除すること。 -->
<!-- 各項目は1〜3行で簡潔に。詳細な設計はセクション9（詳細設計）に記載する。 -->

### 5.1 マイグレーションと後方互換性

- 新規コマンドの追加であり、既存コマンドへの変更はない。後方互換性の問題は発生しない。
- `workflow/rfc-driven.md` への追記は既存の運用ルールを変更するものではなく、例外規定の明文化である。

## 6. 代替案の検討 (Alternatives Considered)

<!-- 最低2案を比較し、選定理由を明示する。各案の説明は1行に収めること。 -->

| 案 | 概要 | 採否 | 決定的理由 |
|---|---|---|---|
| A: 独立コマンド `/qfix` を新規作成 | RFC なし・PR 1本・常に自動マージの超軽量ワークフローを独立コマンドとして定義する | **採用** | `/fix` とはワークフローが本質的に異なり（RFC なし、PR 1本、常に自動マージ）、独立させることで各コマンドの責務が明確になる |
| B: `/fix` に `--no-rfc` オプションを追加 | 既存の `/fix` コマンドにオプションフラグを追加し、RFC 作成をスキップ可能にする | 却下 | RFC スキップに加え、PR 本数（2本→1本）、マージ戦略（条件付き→常時）も変わるため、オプション分岐が複雑化し `/fix` の可読性が著しく低下する |
| C: `/fix --merge` の挙動を変更して RFC を省略 | `/fix --merge` 時に RFC 作成を自動スキップする挙動に変更する | 却下 | `--merge` の意味（マージまで自動実行）と RFC スキップを混同させるセマンティクスの劣化であり、既存の `/fix --merge` ユーザの期待を裏切る |

## 7. 実装・リリース計画 (Implementation Plan)

- 変更対象ファイルと作業項目:

| # | ファイル | 作業内容 |
|---|---------|---------|
| 1 | `adapters/claude/commands/qfix.md` | 新規作成。`/qfix` コマンド定義を記述する。既存の `fix.md` と `repo.md` のパターンを参考に、会話コンテキスト要約→ブランチ作成→System Overview Docs 参照→実装→コミット・プッシュ→PR作成→スカッシュマージ→完了報告の手順を定義する |
| 2 | `workflow/rfc-driven.md` | セクション5「運用ルール」に `/qfix` を「No RFC, No Code」原則の意図的例外として追記する |

- 作業項目1が先行し、2は1のコマンド仕様が確定してから追記する。ただし、両方とも同一コミットで実施可能。
- ロールバック: 各ファイルの変更を git revert するだけで完了する。`qfix.md` は新規ファイルのため、revert で削除される。
- システム概要ドキュメントへの影響: `docs/architecture.md`, `docs/domain-model.md`, `docs/api-overview.md` は vdev リポジトリに存在しないため、更新対象はない。

## 8. 前提条件・依存関係 (Prerequisites & Dependencies)

- 変更対象は vdev リポジトリ内の Markdown ファイル2つ（1つは新規作成）のみである。外部ツールやライブラリへの依存はない。
- `gh` CLI がインストール済みであること（PR 作成・マージに使用）。これは既存コマンドと同じ前提である。
- コマンド定義ファイルが `adapters/claude/commands/` に配置されることで Claude Code のスキルとして認識される仕組みは、既存インフラに依存する。

## 9. 詳細設計 (Detailed Design)

### 9.1 コマンド定義ファイル: `adapters/claude/commands/qfix.md`

以下の構造で `/qfix` コマンドを定義する。既存の `/fix` および `/repo` コマンドの記述パターンに準拠する。

```markdown
# /qfix - 超軽量実装コマンド

RFCを作成せず、会話コンテキストから直接実装を行う超軽量パス。
PRはスカッシュマージまで自動実行する。

## オプション

$ARGUMENTS

## 実行手順

### Step 1: 会話コンテキストの要約
- 会話コンテキストから実装内容・背景・要件を要約する
- slug を生成する（YYYYMMDD-<内容要約のケバブケース>）

### Step 2: ブランチ作成
- デフォルトブランチから feature/<slug> ブランチを作成

### Step 3: System Overview Docs 参照・実装
- 存在する System Overview Docs を参照
- コード改修を実施

### Step 4: コミット・プッシュ・PR作成
- 変更をコミット・プッシュ
- PR を作成

### Step 5: スカッシュマージ・完了報告
- PR をスカッシュマージ
- 完了報告（PR URL 含む）
```

各ステップの詳細仕様:

**Step 1: 会話コンテキストの要約**

`/fix` の Step 1 と同様に、コマンド実行前の会話コンテキストを元ネタとして使用する。`$ARGUMENTS` があればそれを補足指示として扱う。会話コンテキストから以下を要約する:
- 実装すべき内容
- 背景・動機
- 技術的要件

slug は `YYYYMMDD-<slugstr>` 形式で生成する。`slugstr` は最大30文字の全小文字ケバブケース英数字とする。JST 日付を使用する（`rfc-init` と同じ規約）。

**Step 2: ブランチ作成**

デフォルトブランチの取得方法は既存コマンド（`/imp`）と同じパターンを使用する。

```bash
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
git checkout "$DEFAULT_BRANCH"
git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
git checkout -b "feature/<slug>"
```

**Step 3: System Overview Docs 参照・実装**

カレントリポジトリのルート（`git rev-parse --show-toplevel`）を基準に、以下の System Overview Docs が存在する場合は並列に読み込む（存在しないファイルはスキップ）:
- `docs/architecture.md`
- `docs/domain-model.md`
- `docs/api-overview.md`

読み込んだドメイン知識と会話コンテキストの要約に基づき、直接コード改修を実施する。テスト方針（`rules/testing-policy.md`）に基づきテストの要否を判断する。

**Step 4: コミット・プッシュ・PR作成**

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

**Step 5: スカッシュマージ・完了報告**

```bash
gh pr merge --squash --delete-branch
```

完了報告テンプレート:

```
実装が完了し、マージしました。

- **PR**: {PR URL}（マージ済）
```

### 9.2 ワークフロー定義の更新: `workflow/rfc-driven.md`

セクション5「運用ルール」の「No RFC, No Code」ルールの直後に、以下の例外規定を追記する。

```markdown
- **Quick Fix 例外**: `/qfix` コマンドによる超軽量実装は「No RFC, No Code」原則の意図的な例外とする。会話コンテキストで既に背景・要件が合意されている軽微な変更に限定して使用すること。
```

設計根拠:
- 例外を暗黙に運用するのではなく、ワークフロー定義に明文化することで、ルールの意図と例外の位置づけを明確にする。
- 「軽微な変更に限定」の制約を記載することで、大規模な変更に `/qfix` が濫用されるリスクを抑制する。
