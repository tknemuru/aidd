# [RFC] /repo コマンド - 会話ドキュメントのリポジトリ保存

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | AI (RFC Author) |
| **ステータス** | Accepted (承認済) |
| **作成日** | 2026-02-06 |
| **タグ** | commands, workflow, documentation |
| **関連リンク** | なし |

## 1. 要約 (Summary)

会話で議論した内容を `docs/reports/` 配下に Markdown ドキュメントとして保存し、PR を作成する軽量コマンド `/repo` を新規作成する。ドキュメントの種別（report, handover, decision, minutes, roadmap）に応じた統一命名規則 `YYYYMMDD-<type>-<description>.md` で管理する。AI レビューは不要とし、人間レビューのみの軽量フローとする。

## 2. 背景・動機 (Motivation)

### 現状の課題

現在の vdev ワークフローでは、RFC 駆動開発に基づくコード変更のフローは整備されている。しかし、会話中の議論結果をドキュメントとしてリポジトリに保存する標準的な手段がない。

実態として、`docs/reports/` 配下には以下のようなドキュメントが既に手動で保存されている。

```
docs/reports/
  20260204-vdev-flow-analysis.md
  20260205-claude-mem-evaluation.md
  20260205-reviewer-model-switching.md
  20260205-system-docs-optimization.md
  claude-code-insights-en.html
  claude-code-insights-ja.html
```

しかし、命名規則が統一されておらず（HTML ファイルは日付プレフィックスなし、種別コードもなし）、ブランチ・PR 作成の手順も標準化されていない。

### 放置した場合のリスク

- 議論結果が会話ログに埋もれ、ナレッジが散逸する
- ドキュメントの命名が不統一のまま増加し、検索・分類が困難になる
- 手動でのブランチ・PR 作成が面倒なため、ドキュメント保存自体が行われなくなる

## 3. 目的とスコープ (Goals & Non-Goals)

### 目的 (Goals)

- 会話の議論結果をリポジトリに保存するワンコマンドのフローを提供する
- `YYYYMMDD-<type>-<description>.md` の統一命名規則でドキュメントを管理する
- AI レビューを省略した軽量フロー（ブランチ作成 → ドキュメント作成 → PR 作成）を実現する
- `--merge` オプションで PR マージまでの自動実行を可能にする
- vdev 以外のリポジトリでも `docs/reports/README.md` を自動配置して利用可能にする

### やらないこと (Non-Goals)

- ドキュメントに対する AI レビュー（レビューは人間が行う前提）
- 既存の `docs/reports/` 配下のファイルのリネーム・マイグレーション
- Markdown 以外のフォーマット対応（原則 Markdown のみ）

## 4. 前提条件・依存関係 (Prerequisites & Dependencies)

- Claude Code のスラッシュコマンド機構が利用可能であること
- `gh` CLI がインストール済みで認証済みであること
- `git` コマンドが利用可能であること
- vdev リポジトリが `~/projects/vdev` に配置されていること（README.md コピー元として参照）

## 5. 詳細設計 (Detailed Design)

### 5.1 新規ファイル構成

| ファイル | 配置先 | 説明 |
| :--- | :--- | :--- |
| `README.md` | `docs/reports/` | 命名ルール・種別定義 |
| `repo.md` | `adapters/claude/commands/` | `/repo` コマンド定義 |

### 5.2 docs/reports/README.md

命名規則と種別定義を記述するドキュメントである。

#### 命名規則

```
YYYYMMDD-<type>-<description>.md
```

- `YYYYMMDD`: JST 日付（例: 20260206）
- `<type>`: 種別コード（下表参照）
- `<description>`: ケバブケースの英数字による概要（例: `vdev-flow-analysis`）

#### 種別定義

| 種別コード | 名称 | 用途 |
| :--- | :--- | :--- |
| `report` | 調査・分析レポート | 技術調査、パフォーマンス分析、比較検討 |
| `handover` | 引き継ぎ資料 | セッション引き継ぎ、担当交代時の情報共有 |
| `decision` | 意思決定記録 | 設計判断、技術選定の決定根拠 |
| `minutes` | 議事録 | 会議・ミーティングの記録 |
| `roadmap` | ロードマップ | 計画、マイルストーン、今後の方針 |

#### フォーマット

原則 Markdown 形式とする。

### 5.3 adapters/claude/commands/repo.md

コマンド定義の設計を以下に示す。

#### オプション

- `--merge`: PR 作成後、マージまで自動実行する
- `$ARGUMENTS` の残り: 補足指示（ドキュメント内容に関する追加の指示や文脈）

#### 実行フロー

```
Step 1:  引数解析（--merge の有無、補足指示の抽出）
Step 2:  種別・ファイル名決定（会話コンテキストから種別を判定、README.md の命名ルールに従いファイル名を生成）
Step 3:  デフォルトブランチ取得・チェックアウト
Step 4:  ブランチ作成（repo/<description>）
Step 5:  README.md 配置（docs/reports/README.md が存在しなければ ~/projects/vdev/docs/reports/README.md からコピー）
Step 6:  ドキュメント作成（会話コンテキストを構造化した Markdown を docs/reports/ に書き込み）
Step 7:  コミット・プッシュ
Step 8:  PR 作成
Step 9:  マージ処理（--merge 時のみ: gh pr merge --squash --delete-branch）
Step 10: 完了報告（PR URL 必須）
```

#### Step 別の詳細設計

**Step 1: 引数解析**

```markdown
1. $ARGUMENTS に `--merge` が含まれていればフラグを ON にする。
2. 会話コンテキスト（このコマンド実行前の議論内容）を元ネタとして使用する。
```

**Step 2: 種別・ファイル名決定**

会話コンテキストの内容から適切な種別（report / handover / decision / minutes / roadmap）を判定する。判断基準は以下の通りである。

- 技術調査・分析の議論 → `report`
- セッション引き継ぎ・コンテキスト共有 → `handover`
- 設計判断・技術選定の決定 → `decision`
- 会議・ミーティングの記録 → `minutes`
- 計画・方針の策定 → `roadmap`

JST 日付を取得し、`YYYYMMDD-<type>-<description>.md` 形式でファイル名を生成する。`<description>` は会話内容を要約した英数字ケバブケース文字列とする。

**Step 3: デフォルトブランチ取得**

```bash
DEFAULT_BRANCH=$(git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d: -f2 | tr -d ' ')
DEFAULT_BRANCH=${DEFAULT_BRANCH:-main}
git checkout "$DEFAULT_BRANCH"
git pull --ff-only origin "$DEFAULT_BRANCH" 2>/dev/null || true
```

**Step 4: ブランチ作成**

```bash
git checkout -b "repo/<description>"
```

`<description>` は Step 2 で生成したファイル名の `<description>` 部分を使用する。

**Step 5: README.md 配置**

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
if [ ! -f "$REPO_ROOT/docs/reports/README.md" ]; then
  mkdir -p "$REPO_ROOT/docs/reports"
  cp ~/projects/vdev/docs/reports/README.md "$REPO_ROOT/docs/reports/README.md"
fi
```

vdev 以外のリポジトリで初回実行時、vdev から README.md をコピーして命名規則を展開する。

**Step 6: ドキュメント作成**

会話コンテキストを構造化した Markdown ドキュメントを作成し、`docs/reports/YYYYMMDD-<type>-<description>.md` に書き込む。ドキュメントの内容は会話の議論結果を忠実に反映する。

**Step 7: コミット・プッシュ**

```bash
git add docs/reports/
git commit -m "docs: add <type> <description>"
git push -u origin "repo/<description>"
```

README.md をコピーした場合はそれも含めてコミットする。

**Step 8: PR 作成**

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

**Step 9: マージ処理（--merge 時のみ）**

```bash
gh pr merge --squash --delete-branch
```

**Step 10: 完了報告**

```markdown
# --merge なしの場合
ドキュメントを作成し、PRを作成しました。

- **ファイル**: docs/reports/YYYYMMDD-<type>-<description>.md
- **PR**: {PR URL}

人間によるレビュー・マージをお願いします。

# --merge ありの場合
ドキュメントを作成し、マージしました。

- **ファイル**: docs/reports/YYYYMMDD-<type>-<description>.md
- **PR**: {PR URL}（マージ済）
```

### 5.4 既存コマンドとの位置づけ

`/repo` は vdev のコマンド体系において以下の位置づけとなる。

```
RFC駆動開発フロー:
  /rfc → /rrfc → /urfc → /arfc  （設計）
  /imp → /rimp → /uimp → /aimp  （実装）
  /fix                            （軽量実装）

ドキュメント保存フロー:
  /repo                           （ドキュメント保存）  ← 新規

相談フロー:
  /consult                        （相談）
```

`/repo` は RFC 駆動開発フローとは独立した、ドキュメント専用の軽量コマンドである。`/fix` と同様に AI レビューを省略するが、`/fix` が実装を行うのに対し、`/repo` はドキュメント保存のみを行う点が異なる。

## 6. 代替案の検討 (Alternatives Considered)

### 案A: /fix コマンドの拡張（--doc フラグ追加）

- **概要**: 既存の `/fix` コマンドに `--doc` フラグを追加し、ドキュメント作成モードとして動作させる。
- **長所**: 新規コマンド不要。既存のコマンド体系を拡張するだけで済む。
- **短所**: `/fix` は RFC 作成 → 実装の一気通貫フローであり、ドキュメント保存とは概念的に異なる。フラグの有無で挙動が大きく変わり、コマンドの責務が曖昧になる。ブランチプレフィックスも `feature/` と `repo/` で異なるべきである。

### 案B: 専用コマンド /repo の新設（採用案）

- **概要**: ドキュメント保存専用の `/repo` コマンドを新設する。`docs/reports/README.md` で命名規則を定義し、統一的なドキュメント管理を実現する。
- **長所**: 責務が明確（ドキュメント保存に特化）。ブランチプレフィックス `repo/` で識別が容易。実行フローがシンプルで理解しやすい。README.md による命名規則の展開で、他リポジトリへの横展開も容易。
- **短所**: 新規コマンドの追加によりコマンド数が増加する。

### 案C: シェルスクリプト化（bin/repo-save）

- **概要**: `/repo` の処理をシェルスクリプト `bin/repo-save` として実装し、Claude Code の Bash ツールから呼び出す。
- **長所**: 処理がシェルスクリプトに集約され、テスタビリティが向上する。
- **短所**: ドキュメントの内容生成は AI（Claude）が会話コンテキストに基づいて行う必要があるため、シェルスクリプトでは対応できない。ファイル名の決定（種別判定）も AI の判断が必要である。シェルスクリプトで自動化できる部分（ブランチ作成、コミット、PR 作成）は限定的であり、コマンド定義 Markdown で十分に記述できる範囲に収まる。

### 選定理由

案B を採用する。`/repo` はドキュメント保存に特化した軽量コマンドであり、`/fix`（実装）や `/rfc`（設計）とは明確に異なる責務を持つ。専用コマンドとすることで、ブランチプレフィックス・PR 形式・実行フローを最適化できる。案C のシェルスクリプト化は、AI による内容生成・種別判定が本質的な処理であるため、適さない。

## 7. 横断的関心事 (Cross-Cutting Concerns)

### 7.1 セキュリティとプライバシー

本変更はローカル開発ワークフローの自動化であり、セキュリティ上の新たなリスクはない。ドキュメントはリポジトリに保存されるため、リポジトリのアクセス制御に従う。

### 7.2 スケーラビリティとパフォーマンス

該当しない。コマンド実行は都度完結し、蓄積によるパフォーマンス劣化はない。

### 7.3 可観測性 (Observability)

- PR がドキュメント保存の監査証跡として機能する
- `repo/` ブランチプレフィックスにより、ドキュメント保存の PR を他の PR と区別できる
- `docs/reports/README.md` の命名規則により、ドキュメントの種別・日付が一目で判別できる

### 7.4 マイグレーションと後方互換性

- 新規コマンドの追加であり、既存コマンドへの影響はない
- 既存の `docs/reports/` 配下のファイルはそのまま維持する（リネーム不要）
- `docs/reports/README.md` は新規作成であり、既存ファイルとの競合はない

## 8. テスト戦略 (Test Strategy)

vdev はプロンプト定義とシェルスクリプトで構成されるため、自動テストの対象は限定的である。以下の手動検証を行う。

- `/repo` を vdev リポジトリで実行し、ドキュメント作成から PR 作成までの一連のフローが正常に動作することを確認する
  - 種別判定が会話コンテキストに基づき適切に行われること
  - ファイル名が `YYYYMMDD-<type>-<description>.md` 形式で生成されること
  - `repo/` プレフィックスのブランチが作成されること
  - PR が Ready 状態で作成されること
  - 完了報告に PR URL が含まれること
- `/repo --merge` を実行し、PR マージまで自動実行されることを確認する
- vdev 以外のリポジトリで `/repo` を実行し、`docs/reports/README.md` が自動コピーされることを確認する

## 9. 実装・リリース計画 (Implementation Plan)

### フェーズ1: docs/reports/README.md の作成

1. `docs/reports/README.md` を作成し、命名規則・種別定義を記述する
2. 既存のドキュメントとの整合性を確認する

### フェーズ2: /repo コマンド定義の作成

1. `adapters/claude/commands/repo.md` を作成する
2. Step 1〜10 の実行フローを記述する
3. `--merge` オプションの処理を記述する
4. README.md 自動配置の処理を記述する

### フェーズ3: 動作検証

1. vdev リポジトリで `/repo` を実行し、一連のフローを検証する
2. `--merge` オプションの動作を検証する
3. 他リポジトリでの README.md 自動コピーを検証する

### システム概要ドキュメントへの影響

vdev リポジトリには `docs/architecture.md` 等のシステム概要ドキュメントは存在しないため、影響なし。
