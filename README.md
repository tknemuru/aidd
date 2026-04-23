# aidd

リポジトリ横断の AI 活用 RFC 駆動開発フローにおける共用資産を管理するリポジトリ。

## 概要

`aidd` は、Claude Code / GitHub Copilot（Claude モデル）を用いた RFC 駆動開発の標準フローを定義し、各プロジェクトリポジトリに共用資産を配布する仕組みを提供する。配布 CLI は TypeScript 実装で Node.js ランタイム上で動作し、Windows ネイティブと Linux の双方で同一の挙動となる。

## ディレクトリ構成

```
aidd/
├── package.json              # npm パッケージ定義（bin フィールドで 5 本の CLI を公開）
├── bin/
│   ├── src/                 # CLI / オーケストレータの TypeScript 実装
│   └── dist/                # ビルド成果物（npm install 時に利用される JS）
├── adapters/
│   ├── claude/              # Claude Code 向け配布資産
│   │   ├── CLAUDE.md        # 対象リポジトリのルートに配置される指示書
│   │   ├── rules/           # 行動原則
│   │   ├── prompts/         # AI 人格・レビュー基準等
│   │   ├── templates/       # RFC・サービス仕様書・レポート等のテンプレート
│   │   ├── workflow/        # 開発ライフサイクル定義
│   │   └── settings.json    # Claude Code ローカル設定のひな形
│   └── commands/            # 中立プロンプトマスタ（Claude / Copilot 双方へ配布される）
└── docs/                    # 本リポジトリのシステム概要ドキュメント
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
| `csync` | 配布資産を対象リポジトリの `.claude/` と `.github/prompts/` に同期 |
| `rfc-init <slugstr>` | JST 日付付き slug 生成、`rfc/<slug>` ブランチ作成、RFC テンプレ配置 |
| `rfc-publish <slug>` | RFC のコミット・push・Draft PR 作成 |
| `spec-init <slugstr>` | サービス仕様書ディレクトリ・テンプレート配置 |
| `adev` | 自動開発オーケストレータ（`/adev` コマンドから起動される） |

## セットアップ

### 1. Node.js の導入

Node.js LTS（20 以降）を公式インストーラで導入する。Windows 11 では [Node.js 公式サイト](https://nodejs.org/) の LTS MSI を利用するのが簡便である。Linux はディストリビューションのパッケージマネージャ（apt / dnf / pacman 等）か `nvm` を利用する。

### 2. aidd CLI のグローバルインストール

aidd リポジトリを任意の場所に clone し、グローバルインストールを実行する。

```powershell
git clone https://github.com/tknemuru/aidd.git
cd aidd
npm install
npm run build
npm install -g .
```

上記により `csync`, `rfc-init`, `rfc-publish`, `spec-init`, `adev` の 5 本の CLI がパス解決可能となる。

### 3. AI ランタイムの選択

AI 呼び出しは環境変数 `AI_BACKEND` により切り替える。既定は `claude`。

| 値 | 前提 CLI |
| :--- | :--- |
| `claude` | Claude Code CLI が導入されていること |
| `copilot` | GitHub Copilot CLI が導入されていること |

### 4. 対象リポジトリへの同期

対象リポジトリ内で `csync` を実行する。

```powershell
cd <target-repo>
csync
```

以下が同期される:

- `adapters/claude/CLAUDE.md` → `<target-repo>/CLAUDE.md`
- `adapters/claude/` 配下（CLAUDE.md 以外） → `<target-repo>/.claude/`
- `adapters/commands/*.md` → `<target-repo>/.claude/commands/`（Claude 形式）
- `adapters/commands/*.md` → `<target-repo>/.github/prompts/*.prompt.md`（Copilot 形式）
- `adapters/claude/CLAUDE.md` → `<target-repo>/.github/copilot-instructions.md`（Copilot 向けにパス参照を書換）
- `adapters/claude/rules/*.md` → `<target-repo>/.github/instructions/*.instructions.md`（frontmatter 付与 + パス書換）
- `adapters/claude/workflow/*.md` → `<target-repo>/.github/workflow/*.md`（パス書換）

同期後、対象リポジトリは aidd リポジトリへの実行時パス依存を持たない。

## 前提環境

- Windows 11 ネイティブ（PowerShell / Windows Terminal）もしくは Linux
- Node.js LTS（20 以降）
- Claude Code CLI または GitHub Copilot CLI（Claude モデル利用可プラン）
- GitHub CLI (`gh`)
