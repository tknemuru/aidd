# [RFC] Verification Gate アーキテクチャ

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | AI (Claude) |
| **ステータス** | Accepted (承認済) |
| **作成日** | 2026-02-12 |
| **タグ** | workflow, verification, commands |
| **関連リンク** | - |

## 1. 要約 (Summary)

- 現行の `/imp` コマンド内に埋め込まれている Verification（Goals 達成確認）を独立コマンド `/vfy` として分離し、実装エージェントとは異なるセッションで検証を実行する構造に変更する。
- `/rimp` の事前条件として Verification 結果ファイルの存在を要求し、Verification を通過しなければレビューに進めない構造的ゲートを設ける。
- `/aimp` のオーケストレーションに `/vfy` フェーズを組み込み、ユーザから見たワークフロー（`/aimp` 一発実行）は変更しない。

## 2. 背景・動機 (Motivation)

- 現行の `/imp` は Step 1〜8 の長大な逐次処理であり、Step 7 で Goals 達成確認（Verification）を実行する指示がある。しかし、実装と検証が同一エージェント・同一セッションで実行されるため、確証バイアスが生じる。さらに、長い逐次実行の末尾に位置する Step 7 は注意資源の減衰により高確率でスキップまたは形骸化する。
- `/rimp` の Approach Reviewer が Verification 未実施を P0 として検出するが、修正方針として「後続フェーズで実施」「RFC を修正して Verification を変更」等の回避策を提案する問題がある。結果として Verification が実質的に機能していない。
- 根本原因は「テキスト指示による行動制御」に依存していることである。CI/CD の Quality Gate のように、構造的にバイパス不可能な検証関門が必要である。

## 3. 目的とスコープ (Goals & Non-Goals)

### 目的 (Goals)

| # | Goal | 達成確認方法 (Verification) |
|---|------|-----------------------------|
| G1 | `/vfy` コマンドが RFC の Goals テーブルから Verification を抽出し、実行結果を `docs/rfcs/<slug>/verification-results.md` に書き出すこと | `cat adapters/claude/commands/vfy.md` を実行し、Verification 抽出・実行・結果ファイル書き出しの手順が定義されていることを確認する |
| G2 | `/imp` から Step 7（Goals 達成確認）が削除され、完了報告に `/vfy` 実行の案内が含まれること | `cat adapters/claude/commands/imp.md` を実行し、Goals 達成確認の Step が存在しないこと、および完了報告に `/vfy` への誘導が含まれることを確認する |
| G3 | `/rimp` の事前確認で `verification-results.md` の存在と全 PASS を検証し、不備時にエラー終了すること | `cat adapters/claude/commands/rimp.md` を実行し、Step 3 に verification-results.md の存在確認・全 PASS 確認・エラー終了の手順が定義されていることを確認する |
| G4 | `impl-review.md` の Approach Reviewer に Verification エビデンス不備時の修正方針制約が追加されていること | `cat prompts/criterias/impl-review.md` を実行し、Verification 回避策を禁止する修正方針制約の記述が存在することを確認する |
| G5 | `/aimp` のオーケストレーションに `/vfy` フェーズが組み込まれ、FAIL 時にユーザ報告して終了すること | `cat adapters/claude/commands/aimp.md` を実行し、Phase 1.5 としての `/vfy` 呼び出し、および Phase 2 ループ内での再検証フローが定義されていることを確認する |

### やらないこと (Non-Goals)

- Verification の自動修復（FAIL 時に自動でコードを修正する機能）
- `/vfy` の CI/CD パイプラインへの組み込み（現時点ではコマンドベースの手動実行）
- RFC テンプレートの Goals テーブル形式の変更

## 4. 外部仕様 (External Specification)

### 変更の全体像

- 新コマンド `/vfy` を新設し、Verification を実装から分離する。
- `/imp` から Verification ステップを削除し、`/rimp` に Verification 結果の事前条件チェックを追加する。
- `/aimp` のオーケストレーションに `/vfy` を組み込み、自動実行ワークフローを維持する。

### 外部仕様

#### CLI インターフェース

**新コマンド `/vfy <slug>`**

- 入力: RFC の slug
- 処理:
  1. `docs/rfcs/<slug>/rfc.md` から Goals テーブルの全 Verification を抽出する
  2. テスト戦略セクションの全テスト項目を抽出し、テストの充足確認を行う
  3. 各 Verification を実行し、PASS/FAIL とエビデンスを記録する
  4. 結果を `docs/rfcs/<slug>/verification-results.md` に書き出す
  5. `gh pr edit` で PR body に Verification 結果テーブルを追記する
  6. 全 PASS なら「検証完了」と報告、FAIL があれば修正を指示する
- 出力: Verification 結果の要約報告

**`/imp <slug>` の変更**

- Step 7（Goals 達成確認）が削除される
- PR body から Goals 達成確認テーブルが削除される
- 完了報告に「`/vfy <slug>` で検証を実行してください。」が含まれる

**`/rimp <slug>` の変更**

- Step 3 の事前確認に `verification-results.md` の存在確認が追加される
- ファイルが存在しない場合: エラー終了（「`/vfy` を先に実行してください」）
- FAIL 項目がある場合: エラー終了（「全 Verification が PASS になるまで `/vfy` を再実行してください」）

**`/aimp <slug>` の変更**

- Phase 1 と Phase 2 の間に Phase 1.5（`/vfy` 実行）が挿入される
- Phase 2 のレビューループ内で `/uimp` 後に `/vfy` による再検証が追加される

#### 削除・廃止される機能

- `/imp` の Step 7（Goals 達成確認）: `/vfy` に移管されるため削除
- `/imp` の PR body における Goals 達成確認テーブル: `/vfy` が PR body を更新するため削除

## 5. テスト戦略 (Test Strategy)

### 実施するテスト

| テスト対象 | テスト種別 | 検証観点 |
|---|---|---|
| `vfy.md` コマンド定義 | 統合 | `/vfy` の手順が RFC テンプレートの Goals テーブル形式と整合すること |
| `imp.md` コマンド定義 | 統合 | Step 7 削除後の Step 番号が連続していること、完了報告に `/vfy` 案内が含まれること |
| `rimp.md` コマンド定義 | 統合 | Step 3 に verification-results.md の前提条件チェックが含まれること |
| `aimp.md` コマンド定義 | 統合 | Phase 1.5 と Phase 2 ループ内の `/vfy` 呼び出しが定義されていること |
| `impl-review.md` 検証項目 | 統合 | Approach Reviewer の修正方針制約が記載されていること |

### 境界値・エッジケース

- `verification-results.md` が存在するが中身が空の場合
- Goals テーブルに Verification が1件も定義されていない RFC の場合
- `/vfy` 実行中に一部の Verification が副作用を伴う操作である場合

## 6. 非機能要件 (Non-Functional Requirements)

### 6.1 セキュリティとプライバシー

- 該当なし。本変更はコマンド定義ファイル（Markdown）の変更のみであり、セキュリティに影響する実行コードの変更を含まない。

## 7. 代替案の検討 (Alternatives Considered)

| 案 | 概要 | 採否 | 決定的理由 |
|---|---|---|---|
| A: Verification Gate（`/vfy` 分離） | Verification を独立コマンドに分離し、結果ファイルの存在を構造的ゲートとする | **採用** | 確証バイアスの排除（別セッション実行）と構造的バイパス不可能性を両立できる |
| B: `/imp` 内の Verification 指示強化 | Step 7 の指示テキストをより強い表現に書き換え、スキップ禁止を明示する | 却下 | テキスト指示の強化は根本原因（テキスト依存）を解決しない。エージェントの注意資源減衰に対して無力である |
| C: `/rimp` での事後 Verification | Verification を `/rimp` 内に移動し、レビューの一環として実行する | 却下 | レビュアーが Verification を実行する設計は責務の混同であり、レビュー時間の増大と Verification 品質の低下を招く |

## 8. 実装・リリース計画 (Implementation Plan)

### 作業項目

| # | 種別 | 作業内容 | 依存 |
|---|------|---------|------|
| 1 | コード | `adapters/claude/commands/vfy.md` を新規作成する。RFC の Goals テーブルから Verification を抽出・実行し、結果を `docs/rfcs/<slug>/verification-results.md` に書き出し、PR body を更新する手順を定義する | - |
| 2 | コード | `adapters/claude/commands/imp.md` を改修する。Step 7（Goals 達成確認）を削除し、Step 8 の PR body から Goals 達成確認テーブルを削除し、完了報告に `/vfy` 実行案内を追加し、Step をリナンバリングする | - |
| 3 | コード | `adapters/claude/commands/rimp.md` を改修する。Step 3 に `verification-results.md` の存在確認と全 PASS 確認を追加し、不備時のエラー終了を定義する | - |
| 4 | コード | `prompts/criterias/impl-review.md` を改修する。Approach Reviewer セクションに Verification エビデンス不備時の修正方針制約を追加する | - |
| 5 | コード | `adapters/claude/commands/aimp.md` を改修する。Phase 1.5（`/vfy` 呼び出し）を追加し、Phase 2 ループに `/uimp` 後の `/vfy` 再検証フローを組み込む | #1 |
| 6 | コード | 全変更ファイルの整合性を統合確認する。Step 番号の連続性、コマンド間の参照関係、`verification-results.md` のパス規約が一貫していることを検証する | #1, #2, #3, #4, #5 |

### 完了条件

- 上記の全作業項目が完了していること
- Goals の Verification が全て OK であること
- テスト戦略に記載した全テストが通過していること

### ロールバック基準と手順

- ロールバック基準: `/vfy` コマンドが既存ワークフロー（`/imp` → `/rimp` → `/uimp`）を破壊する場合
- ロールバック手順: Git revert により変更前のコマンド定義に復元する

## 9. 前提条件・依存関係 (Prerequisites & Dependencies)

- RFC テンプレート（`templates/rfc/rfc-default.md`）の Goals テーブル形式が現行のまま維持されること
- `gh` CLI がインストールされ、PR の編集権限があること
- `/imp`、`/rimp`、`/uimp`、`/aimp` の現行コマンド定義が本 RFC 記載の構造と一致すること

## 10. 詳細設計 (Detailed Design)

### 10.1 `/vfy` コマンドの設計

`/vfy` コマンドは以下の Step で構成する。

**Step 1: slug の取得**
- 引数が空の場合は slug の入力を要求する。

**Step 2: ブランチ確認**
- `feature/<slug>` ブランチであることを確認し、異なる場合はチェックアウトする。

**Step 3: RFC 読み込みと Verification 抽出**
- `docs/rfcs/<slug>/rfc.md` を読み込む。
- Goals テーブルから全 Goal の `#`、`Goal`、`達成確認方法 (Verification)` を抽出する。
- テスト戦略セクションから全テスト項目を抽出する。

**Step 4: テスト充足確認**
- テスト戦略に記載された全テストが実装されているか確認する。
- プロジェクトのテストコマンドを実行し、全テストが通過することを確認する。
- テスト不足・失敗がある場合は FAIL として記録し、Step 5 の Verification 実行には進まない。

**Step 5: Verification 実行**
- 各 Goal の Verification を順に実行する。
- 実行ルール（現行 `/imp` Step 7 と同一）:
  - Verification に記載されたコマンド・手順をそのまま実行する。
  - 「目視確認」「記載があること」等の確認は、対象ファイルの該当箇所を Read で読み込み、期待する内容が存在することを引用で示す。
  - 「〜を追記済み」「〜を実装済み」はエビデンスとして認めない。
  - 副作用を伴う操作は実行前にユーザに承認を求める。
  - Verification の実行をスキップし、後続の人間作業として残すことは禁止する。
- 結果を PASS/FAIL + エビデンスとして記録する。

**Step 6: 結果ファイル書き出し**
- 結果を以下の形式で `docs/rfcs/<slug>/verification-results.md` に書き出す:

```markdown
# Verification Results

| # | Goal | Verification | 結果 | エビデンス |
|---|------|-------------|------|-----------|
| G1 | {Goal内容} | {確認方法} | PASS / FAIL | {実行コマンドの出力、ファイル該当箇所の引用等} |
```

**Step 7: PR body 更新**
- `gh pr edit` で PR body に Verification 結果テーブルを追記する。既存の Verification 結果セクションがある場合は置換する。

**Step 8: コミット & プッシュ**
- `docs/rfcs/<slug>/verification-results.md` をステージングしてコミットする。
- コミットメッセージ: `docs: add verification results for <slug>`
- `feature/<slug>` ブランチをリモートにプッシュする。

**Step 9: 結果報告**
- 全 PASS の場合: 「全 Verification が PASS しました。`/rimp <slug>` でレビューを実行してください。」と報告する。
- FAIL がある場合: FAIL 項目を一覧表示し、「FAIL の項目を修正後、`/vfy <slug>` を再実行してください。」と報告する。

### 10.2 `/imp` の改修設計

現行の Step 構成と改修後の対応:

| 現行 Step | 改修後 |
|-----------|--------|
| Step 1: slug の取得 | Step 1: そのまま |
| Step 2: ブランチ作成 | Step 2: そのまま |
| Step 3: RFC・システム概要ドキュメントの読み込み | Step 3: そのまま |
| Step 4: 実装タスク策定 | Step 4: そのまま |
| Step 5: 実装 | Step 5: そのまま |
| Step 6: テスト実行 | Step 6: そのまま |
| Step 7: Goals 達成確認 | **削除** |
| Step 8: コミット & プッシュ & PR 作成 | Step 7: PR body から Goals 達成確認テーブルを削除。完了報告に `/vfy` 案内を追加 |

### 10.3 `/rimp` の改修設計

Step 3 の事前確認に以下を追加する:

```
3. `docs/rfcs/<slug>/verification-results.md` の存在を確認せよ。
   - ファイルが存在しない場合: 「`/vfy <slug>` を先に実行してください。」と表示してエラー終了する。
   - ファイルが存在するが FAIL 項目がある場合: 「全 Verification が PASS になるまで `/vfy <slug>` を再実行してください。」と表示してエラー終了する。
```

### 10.4 `impl-review.md` の改修設計

Approach Reviewer セクションの末尾に以下を追加する:

```
- Verification エビデンスに不備がある場合、修正方針は「/vfy の再実行」に限定する。以下は修正方針として認めない:
  - 「後続フェーズで実施する」
  - 「RFC を修正して Verification を変更する」
  - 「人間が確認する」
  - その他、Verification の実行を回避するあらゆる提案
```

### 10.5 `/aimp` の改修設計

改訂後のフロー:

```
Phase 1: Task(/imp) → 実装・テスト・commit・push・Draft PR作成（Verification なし）
Phase 1.5: Task(/vfy) → Verification 実行・結果ファイル書き出し・PR body 更新
            全 PASS → Phase 2 へ
            FAIL あり → ユーザに報告して終了
Phase 2: Loop {
  Task(/rimp) → レビュー
  if Request Changes:
    Task(/uimp) → 修正
    Task(/vfy) → 再検証
              全 PASS → Task(/rimp) に戻る
              FAIL あり → ユーザに報告して終了
}
Phase 3: 完了報告
```

Phase 1.5 の Task プロンプト:

```
以下のコマンド定義を読み込み、その手順に従って Verification を実行せよ。
- コマンド定義: ~/projects/vdev/adapters/claude/commands/vfy.md

$ARGUMENTS の値は「{slug}」として扱え。
```

Phase 2 ループ内の `/vfy` 再検証も同一プロンプトで Task を起動する。
