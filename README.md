# vdev

リポジトリ横断の AI 活用 RFC 駆動開発フローにおける共用資産を管理するリポジトリ。

## 概要

`vdev` は、Claude Code を用いた RFC 駆動開発の標準フローを定義し、各プロジェクトリポジトリに共用資産を配布する仕組みを提供する。

## ディレクトリ構成

```
vdev/
├── adapters/claude/        # Claude Code 用設定（CLAUDE.md, コマンド定義）
├── bin/                    # CLI ツール
├── prompts/
│   ├── roles/              # AI 人格定義（RFC Author, レビュアー等）
│   └── criterias/          # レビュー検証項目（RFC用, 実装用）
├── templates/
│   ├── rfc/                # RFC テンプレート
│   └── review/             # レビュー結果テンプレート
└── workflow/               # 開発ライフサイクル定義
```

## 開発ライフサイクル

詳細は [workflow/rfc-driven.md](workflow/rfc-driven.md) を参照。

| Stage | コマンド | 概要 |
| :--- | :--- | :--- |
| 1. Drafting | `/rfc` | RFC を起草し、`rfc/<slug>` ブランチに push、Draft PR を作成 |
| 2. Reviewing | `/rrfc`, `/urfc` | 3 人格による並列レビュー、指摘に基づく修正、Accepted 後に人間がマージ |
| 3. Implementing | `/imp`, `/rimp`, `/uimp` | `feature/<slug>` ブランチで実装、コードレビュー、修正 |
| 4. Closing | `/upr` | 人間の PR コメント対応、最終確認、実装 PR マージ |

## CLI ツール

| コマンド | 概要 |
| :--- | :--- |
| `csync` | `adapters/claude/` 配下の設定を対象リポジトリの `.claude/` および `CLAUDE.md` に同期 |
| `rfc-init <slugstr>` | JST 日付付き slug 生成、`rfc/<slug>` ブランチ作成、RFC ディレクトリ・テンプレート配置 |
| `rfc-publish <slug>` | RFC のコミット・push・Draft PR 作成 |

## セットアップ

### 1. CLI ツールへのパスを通す

`~/.local/bin` にシンボリックリンクを作成する。

```bash
mkdir -p ~/.local/bin
ln -sf ~/projects/vdev/bin/csync ~/.local/bin/csync
ln -sf ~/projects/vdev/bin/rfc-init ~/.local/bin/rfc-init
ln -sf ~/projects/vdev/bin/rfc-publish ~/.local/bin/rfc-publish
```

`~/.local/bin` が `PATH` に含まれていない場合は `~/.profile` 等に追加する。

### 2. 対象リポジトリへの同期

対象リポジトリ内で `csync` を実行する。

```bash
cd ~/projects/<target-repo>
csync
```

以下が同期される:
- `adapters/claude/CLAUDE.md` → `<target-repo>/CLAUDE.md`
- `adapters/claude/` 配下（CLAUDE.md 以外） → `<target-repo>/.claude/`

## 前提環境

- Windows 11 + WSL (Ubuntu)
- VS Code (Remote-WSL)
- Claude Code (Claude Max Plan)
- GitHub CLI (`gh`)
