# aidd

リポジトリ横断の AI 活用 RFC 駆動開発フローにおける共用資産を管理するリポジトリ。

## 概要

`aidd` は、Claude Code を用いた RFC 駆動開発の標準フローを定義し、各プロジェクトリポジトリに共用資産を配布する仕組みを提供する。

## ディレクトリ構成

```
aidd/
├── install.sh              # CLI ツールをグローバルインストールするスクリプト
├── bin/                    # CLI ツール（install.sh で ~/.local/bin/ に symlink される）
└── adapters/claude/        # csync で各リポジトリの .claude/ へコピーされる配布単位
    ├── CLAUDE.md           # ルートに配置されるプロジェクト指示書
    ├── commands/           # Claude Code スラッシュコマンド定義
    ├── rules/              # 行動原則
    ├── prompts/
    │   ├── roles/          # AI 人格定義（RFC Author, レビュアー等）
    │   └── criterias/      # レビュー検証項目（RFC用, 実装用）
    ├── templates/          # RFC・サービス仕様書・レポート等のテンプレート
    └── workflow/           # 開発ライフサイクル定義
```

## 開発ライフサイクル

詳細は [adapters/claude/workflow/rfc-driven.md](adapters/claude/workflow/rfc-driven.md) を参照。

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
| `spec-init <slugstr>` | サービス仕様書ディレクトリ・テンプレート配置 |
| `adev.sh` | 自動開発オーケストレータ（`/adev` コマンドから起動される） |

## セットアップ

### 1. CLI ツールのグローバルインストール

aidd リポジトリを任意の場所に clone し、`install.sh` を一度実行する。

```bash
git clone git@github.com:tknemuru/aidd.git ~/projects/aidd
cd ~/projects/aidd
./install.sh
```

`install.sh` は `bin/` 配下の CLI ツールを `~/.local/bin/` にシンボリックリンクする。clone 先は任意で、スクリプトが自己発見する。

インストール先を変えたい場合は `AIDD_INSTALL_DIR` 環境変数で上書きできる。

```bash
AIDD_INSTALL_DIR=/usr/local/bin ./install.sh
```

`~/.local/bin` が `PATH` に含まれていない場合は `~/.profile` や `~/.bashrc` に以下を追加する。

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### 2. 対象リポジトリへの同期

対象リポジトリ内で `csync` を実行する。

```bash
cd ~/projects/<target-repo>
csync
```

以下が同期される:
- `adapters/claude/CLAUDE.md` → `<target-repo>/CLAUDE.md`
- `adapters/claude/` 配下（CLAUDE.md 以外） → `<target-repo>/.claude/`

同期後、対象リポジトリは aidd リポジトリへの実行時パス依存を持たない。各コマンド定義は `.claude/` 相対パスで自身の資産を参照する。

## 前提環境

- Windows 11 + WSL (Ubuntu)
- VS Code (Remote-WSL)
- Claude Code (Claude Max Plan)
- GitHub CLI (`gh`)
