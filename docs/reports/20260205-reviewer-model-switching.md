# レビュアーモデル切り替え評価レポート

**作成日**: 2026-02-05
**目的**: /rrfc, /rimp の3並列レビュアーのモデルをHaikuまたはSonnetに切り替えた場合のレビュー品質・コストへの影響を評価

---

## 1. 背景

vdevフローのトークン使用料削減策として、`/rrfc` と `/rimp` で起動される3並列レビュアーのサブエージェントモデルを、デフォルト（Opus）からHaikuまたはSonnetに切り替える案を検討した。

## 2. 現在のレビュアーに求められるタスクの性質

実際のレビュー結果（abel, dre, Reluca プロジェクト）を分析した結果、以下の能力が要求されている:

| 能力 | 具体例（実際のレビューから） |
|------|------|
| ドメイン文脈の理解 | ケリー基準の設計意図を理解した上で bankroll 手動管理のリスクを指摘 |
| コードベースとの整合性評価 | 既存の `UNIQUE` 制約パターン、ロガー方式との一貫性を検証 |
| 設計レベルの論理的分析 | `Promise.allSettled` vs `Promise.all` の選択根拠の妥当性評価 |
| 副作用の検出 | `config.tiers.sort()` による元配列変更の暗黙的副作用を発見 |
| 長いdiffの追跡 | `/rimp` では数百〜数千行のdiffを読み通して指摘 |

## 3. モデル別ベンチマーク

### SWE-bench Verified スコア

| モデル | SWE-bench スコア | Opus比 |
|--------|-----------------|--------|
| Opus 4.5 | 80.9% | 基準 |
| Sonnet 4.5 | 77.2% (parallel: 82.0%) | -3.7pt |
| Haiku 4.5 | 73.3% | -7.6pt |

### Qodo 400PR 実ベンチマーク（コードレビュー特化）

Qodoの調査による実際のPRレビュー品質比較:

- **Haiku 4.5 Thinking (4096トークン予算)**: 品質スコア 7.29 / 勝率 58%
- **Sonnet 4.5 Thinking**: 品質スコア 6.60 / 勝率 42%

Thinkingモード有効化時、日常的なPRレビューではHaikuがSonnetより高品質という結果が出ている。

### モデル別の強み・弱み

| モデル | 強み | 弱み |
|---|---|---|
| Opus 4.5 | rebuild問題、missing dispose、async bugなど他モデルが見逃す問題を検出 | コスト最大 |
| Sonnet 4.5 | マルチファイルロジック、アーキテクチャ推論が強い。文脈保持が安定 | Opusほどの深い検出力はない |
| Haiku 4.5 | 短〜中規模のレビューで高精度。コスト1/3。速度2倍 | 長いセッションで文脈を見失う（変数名忘れ、クラス名変更等）。マルチファイル推論はSonnetが上 |

## 4. 評価結果

### 全員Haikuにした場合

- **コスト削減効果**: 大（レビューコスト約1/3）
- **品質リスク**: **高い**。Technical Quality Reviewer と Approach Reviewer が行っている深い推論（設計判断の妥当性評価、副作用検出、アーキテクチャ整合性分析）はHaikuが長い文脈で品質低下する領域と一致する

### 全員Sonnetにした場合

- **コスト削減効果**: 中（Opusより低コストだがHaikuほどではない）
- **品質リスク**: **低い**。SWE-bench差は-3.7pt。マルチファイル推論はSonnetの得意領域。ただしOpusが検出する深いバグを見逃すリスクは残る

### 推奨案: レビュアーの役割特性に応じたモデル割り当て

一律切り替えではなく、レビュアーごとにモデルを選択する:

| レビュアー | 推奨モデル | 理由 |
|---|---|---|
| Security & Risk Reviewer | **Haiku 4.5** | チェック項目が明確（OWASP Top 10、インジェクション等）。パターンマッチ的な検出タスクはHaikuの得意領域。実際のレビュー結果も定型的な検証が多い |
| Technical Quality Reviewer | **Sonnet 4.5** | マルチファイルの構造的整合性、パフォーマンス分析など、アーキテクチャレベルの推論が必要。Haikuが苦手な長いdiffの文脈追跡が求められる |
| Approach Reviewer | **Sonnet 4.5** | RFCの設計意図とビジネス要件の整合性評価は抽象度が高い推論タスク。ドメイン文脈の深い理解が必要 |

### コマンド別の適用

#### `/rrfc`（RFCレビュー）

RFCレビューは入力がRFC文書のみ（数百行）で比較的短い。

| レビュアー | 推奨モデル | 補足 |
|---|---|---|
| Security & Risk | Haiku | RFC段階はコードがなく、設計レベルのリスク評価。Haikuで十分 |
| Technical Quality | Sonnet | 設計の構造的妥当性の評価にはSonnetが適切 |
| Approach | Sonnet | RFC全体の論理的整合性評価には推論力が必要 |

#### `/rimp`（実装レビュー）

実装レビューはdiff（数百〜数千行）+ RFCを読む必要があり、コンテキストが大きい。

| レビュアー | 推奨モデル | 補足 |
|---|---|---|
| Security & Risk | Haiku | 脆弱性パターンの検出は定型的。SQLインジェクション、XSS等のチェックリスト型タスク |
| Technical Quality | Sonnet | 長いdiff全体を追跡して構造的問題を検出する必要がある。Haikuが最も苦手な領域 |
| Approach | Sonnet | RFCとdiffの整合性検証は文脈横断の推論が必要 |

## 5. 期待されるトークン消費削減効果

- 3レビュアー中1つをHaikuに → 約15〜25%のレビューコスト削減
- Haikuはトークン単価がSonnetの約1/3、速度も約2倍速
- Max Plan のレート制限においても、Haikuサブエージェントの消費が軽くなるためボトルネック緩和が期待できる

## 6. 実装方法

`/rrfc` と `/rimp` の Task 起動時に `model` パラメータを指定するだけで実現可能。各Taskプロンプトの構成変更は不要:

```markdown
#### Task 2: Security & Risk Reviewer
- 人格ファイル: `~/projects/vdev/prompts/roles/security-risk-reviewer.md`
- 出力先: `docs/rfcs/<slug>/review-security-risk.md`
- **モデル: haiku**   ← この1行を追加
```

## 7. 参考資料

- [Qodo: Benchmarking Claude Haiku 4.5 and Sonnet 4.5 on 400 Real PRs](https://www.qodo.ai/blog/thinking-vs-thinking-benchmarking-claude-haiku-4-5-and-sonnet-4-5-on-400-real-prs/)
- [Claude Haiku 4.5 Deep Dive - Caylent](https://caylent.com/blog/claude-haiku-4-5-deep-dive-cost-capabilities-and-the-multi-agent-opportunity)
- [Claude Opus 4.5 Benchmarks - Vellum](https://www.vellum.ai/blog/claude-opus-4-5-benchmarks)
- [Sonnet 4.5 vs Haiku 4.5 vs Opus 4.1 - Medium](https://medium.com/@ayaanhaider.dev/sonnet-4-5-vs-haiku-4-5-vs-opus-4-1-which-claude-model-actually-works-best-in-real-projects-7183c0dc2249)
- [Claude Haiku 4.5 in Production - Sider](https://sider.ai/blog/ai-tools/claude-haiku-4_5-in-production-surviving-the-quiet-genius-and-its-sneaky-gotchas)
