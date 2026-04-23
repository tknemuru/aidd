# claude-mem 導入評価レポート

**作成日**: 2026-02-05
**目的**: vdevフローにおけるトークン使用料削減策として claude-mem の導入可否を評価

---

## 1. 背景

Maxプランにおいて5時間内の上限に頻繁に到達する状況が発生しており、トークン使用料の削減が課題となっている。巷で話題の [claude-mem](https://github.com/thedotmack/claude-mem) をvdevフローに導入することで改善が見込めるか調査した。

## 2. claude-mem の概要

claude-memは Claude Code のプラグイン（hooks + MCP サーバー）で、セッション間の永続メモリを提供する。

### 技術スタック

- **SQLite** + **Chroma**（ベクトルDB）: セッション・観測・要約を永続保存
- **Bun ランタイム**: port 37777 で HTTP API ワーカーサービスを管理
- **hooks**: 5つのライフサイクルフック（SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd）
- **MCP ツール**: 4つの検索エンドポイント（search, timeline, get_observations, __IMPORTANT）

### 3層検索によるトークン節約メカニズム

1. **検索層**: `search` で結果インデックスを取得（約50-100トークン/結果）
2. **タイムライン層**: `timeline` で文脈を確認
3. **詳細層**: `get_observations` で絞り込まれた ID の全詳細のみ取得（約500-1,000トークン/結果）

主張される効果: 約10倍のトークン節約（75%削減）。ただしこれは「メモリ全文をコンテキストに入れる vs 段階的検索」の比較。

## 3. vdevフローのトークン消費構造

### コマンド別トークン重量

| ランク | コマンド | 主なコスト要因 |
|--------|----------|----------------|
| 1 (最重) | `/upr` | PRコメント取得 + system docs 3種 + diff + 対話ループ |
| 2 | `/rimp` | コードdiff x 3並列レビュアー |
| 3 | `/rrfc` | RFC x 3並列レビュアー（各自ロール+基準+テンプレ+RFC読み込み） |
| 4 | `/rfc` | system docs 3種 + ロール + テンプレート + コードベース調査 |
| 5 | `/imp` | RFC + system docs 3種 + タスク計画 |
| 6-7 | `/urfc`, `/uimp` | RFC + レビュー結果3本 + system docs 3種 |
| 8 (最軽) | `/consult` | ユーザー入力のみ、オンデマンド読み取り |

### 消費の構造的特徴

- 1開発サイクルで最低7コマンドを順次実行
- 各コマンドは新規セッションとして起動され、同一ファイル（`docs/architecture.md`, `docs/domain-model.md`, RFC本文等）を毎回ゼロから読み直す
- `/rrfc` と `/rimp` は3並列サブエージェントを起動し、各自が同じファイル群を読み込むため消費が3倍化

## 4. 評価結果

### 論点1: 使用料削減はどれほど見込めるか

**結論: 大幅な節約は見込めない。むしろ増加リスクがある。**

- vdevフローのトークン消費の主因は**コマンドプロンプト自体が指示するファイル読み込み**であり、claude-memのメモリ検索で代替できるものではない
- claude-memの節約効果「10x」は「メモリ全文をコンテキストに入れる vs 段階的検索」の比較であり、vdevのような構造化された明示的ファイル読み込みには適用されない
- 各コマンドは明確に「このファイルを読め」と指示しているため、claude-memの「関連記憶を自動注入」が介入する余地がない
- claude-memのhooks（SessionStart, UserPromptSubmit, PostToolUse等）が毎回発火し、メモリ検索・注入のオーバーヘッドが加算される

**見込める削減効果: 0〜微増（むしろ増加リスクあり）**

### 論点2: リスク・デメリット

| カテゴリ | リスク・デメリット | 深刻度 |
|----------|-------------------|--------|
| 安定性 | ゾンビプロセス蓄積（過去に155プロセス/51GB RAM報告あり）、ワーカータイムアウト、認証失敗等のバグが頻発。v9.0台で週1-2回ペースでバグ修正中 | 高 |
| 依存の複雑化 | Bun, Chroma, SQLite, HTTPワーカー（port 37777）が必要。WSL2環境での追加の不安定要因 | 中〜高 |
| hooks競合 | vdevフローは将来的にhooksを活用する可能性がある。claude-memが5つのライフサイクルhookを占有するため、競合・干渉のリスク | 中 |
| セッション汚染 | Observerセッションが `claude --resume` リストを汚染する（過去に34%ノイズ報告）。v9.0.11で改善されたが完全解消ではない | 中 |
| ライセンス | AGPL-3.0（ragtime/はPolyForm Noncommercial 1.0.0）。商用利用時に注意が必要 | 低〜中 |
| トークン増加 | メモリ検索・注入のオーバーヘッドにより、vdevの定型コマンドではむしろトークン消費が増える | 中 |
| デバッグ困難 | 問題発生時に「claude-memの問題か、vdevフローの問題か」の切り分けが困難に | 中 |

## 5. 総合判断

**導入は推奨しない。**

claude-memは「自由形式の長期コーディングプロジェクトでセッション間の文脈を維持したい」というユースケースに適したツールである。一方、vdevフローは構造化されたコマンド駆動ワークフローであり、トークン消費の構造が根本的に異なる。問題とソリューションのミスマッチが明確であるため、リスクを取って導入する価値はない。

| 観点 | claude-mem が解決する問題 | vdevフローのトークン消費の原因 |
|------|--------------------------|-------------------------------|
| 本質 | 「前回のセッションで何をしたか覚えていない」 | 「構造化されたワークフローが毎回大量のコンテキストを読み込む」 |
| 対象 | 自由形式のコーディングセッション間の記憶 | 定型コマンドによるドキュメント・コードの繰り返し読み込み |
| 効果が出る場面 | 「昨日どこまでやったっけ？」を解消 | system docs, RFC, diff, レビュー結果の重複読み込み |

## 6. 参考: vdevフロー自体でのトークン削減の方向性

（本レポートの議論対象外だが参考情報として記載）

1. **サブエージェントのモデル切り替え**: `/rrfc`, `/rimp` の3並列レビュアーを Haiku モデルで実行
2. **system docs の読み込み最適化**: コマンドによって不要な system docs の読み込みを省略
3. **diff のチャンク戦略の改善**: `/rimp` の diff 分割閾値（現在3000行）の最適化
4. **CLAUDE.md / auto memory の活用**: Claude Code 標準機能の auto memory でセッション間の文脈を軽量に維持

## 7. 参考資料

- [claude-mem GitHub リポジトリ](https://github.com/thedotmack/claude-mem)
- [Someone Built Memory for Claude Code and People Are Actually Using It](https://levelup.gitconnected.com/someone-built-memory-for-claude-code-and-people-are-actually-using-it-9f657be0f193)
- [Claude-Mem: Persistent Memory for AI Coding Assistants](https://corti.com/claude-mem-persistent-memory-for-ai-coding-assistants/)
- [Claude Code Pricing: How to Save Money](https://blog.promptlayer.com/claude-code-pricing-how-to-save-money/)
