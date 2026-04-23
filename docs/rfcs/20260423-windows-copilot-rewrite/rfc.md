# [RFC] Windows ネイティブ + GitHub Copilot 前提への aidd 一括刷新

| 項目 | 内容 |
| :--- | :--- |
| **作成者 (Author)** | Claude (RFC Author) |
| **作成日** | 2026-04-23 |
| **ステータス (Status)** | Accepted (承認済) |
| **タグ** | refactor, runtime, cross-platform, copilot |
| **関連リンク** | docs/rfcs/20260423-windows-copilot-rewrite/rfc.md |

<!-- 記述形式ルール（全セクション共通）:
1. 80文字上限: 1箇条書き項目・1テーブルセルは80文字以内
   80文字に収まらない場合はサブ項目分割またはテーブル行分割
2. 散文禁止（例外あり）:
   §1のみ散文許可（5文以内）
   §11のコードブロック間補足は2文以内の散文許可
   他セクションは散文禁止でテーブルまたは箇条書きのみ
3. §1-5 コード識別子禁止:
   バッククォートで囲まれたコード識別子の使用を禁止
   （ファイル名、関数名、変数名、パス、コマンド）
   機能名称またはドメイン用語で記述すること
-->

## 0. 絶対守ること

<!-- 本セクションは人間のみが記述する。AI は空欄のまま残すこと。 -->

## 1. 背景・動機 (Motivation)

<!-- 散文で記述。ただし5文以内。 -->

現行の aidd は配布 CLI が bash スクリプトで実装されており、
Windows ネイティブ環境では起動自体ができない構造となっている。
加えて AI ランタイム呼び出しは Claude Code CLI 専用に直結しており、
GitHub Copilot を Claude モデルで利用する運用が取れない。
また WSL 固有のパス拒否ルール・シンボリックリンク・
Windows 非互換のインストーラが随所に残り、利用対象が実質
WSL + Claude Code に限定されてしまっている。
本 RFC はこの縛りを解き、Windows ネイティブと
GitHub Copilot（Claude モデル）前提で動作する構成へ一括刷新する。

## 2. 機能要件

### 達成すべき要件

<!-- コード識別子禁止。機能名称またはドメイン用語で記述。 -->

| ID | 要件 |
|----|------|
| F-1 | 配布 CLI 全機能を Windows ネイティブのシェルで起動可能にする |
| F-2 | AI 呼び出しをバックエンド抽象レイヤ経由へ統一する |
| F-3 | 環境変数によるバックエンド切替を Claude と Copilot で提供する |
| F-4 | 中立プロンプトを Claude 向けと Copilot 向けへ双方向配布する |
| F-5 | 配布物のシンボリックリンク依存を排除し実体ディレクトリ化する |
| F-6 | Windows 非互換のパス拒否ルールおよび関連フックを撤廃する |
| F-7 | 自動開発オーケストレーションの既存挙動を移植先でも同等に再現する |
| F-8 | インストール機構を Node 系ツールチェーン前提へ刷新する |
| F-9 | 既存シェルテストに相当する検証を移植後スタックで再構築する |
| F-10 | ドキュメントの前提環境記述を Windows と Copilot 前提へ更新する |

### やらないこと

- Cursor など他エディタ・他 AI 環境への対応
- 既存 bash スクリプトとの後方互換維持
- サービス仕様書テンプレートやレビュー観点定義の変更
- 既存 RFC 駆動開発フローそのものの再設計

## 3. 非機能要件

### 達成すべき要件

| ID | 分類 | 要件 |
|----|------|------|
| NF-1 | 可搬性 | Windows ネイティブと Linux の双方で同一 CLI が起動可能 |
| NF-2 | 可搬性 | パス区切り・改行コードの OS 差異を吸収する |
| NF-3 | 保守性 | バックエンド追加が抽象境界の実装追加だけで完結する |
| NF-4 | 互換性 | 自動開発のフェーズ判定・リカバリ挙動を等価に維持する |
| NF-5 | 運用性 | エスカレーションマーカー検出で即時中断する |
| NF-6 | 運用性 | AI 呼び出しにタイムアウト安全弁を設ける |
| NF-7 | 可観測性 | 決定ログ・リカバリ試行ログを標準出力へ出す |
| NF-8 | 配布容易性 | 単一コマンドで CLI をインストール可能とする |

### やらないこと

- 実行性能の最適化（起動時間短縮、並列度向上等）
- CI/CD パイプラインの整備
- テレメトリ・メトリクス収集基盤の導入

## 4. 実現方式

<!-- 機能要件・非機能要件をどう実現するかの高レベル方針。 -->

| 要件 | 実現方式 |
|------|----------|
| F-1, NF-1, NF-2 | 配布 CLI を TypeScript に書き換え Node.js ランタイムで駆動 |
| F-2, F-3, NF-3 | AI バックエンド抽象インタフェースを導入し環境変数で切替 |
| F-4 | 中立プロンプトを配布時に Claude 形式と Copilot 形式へ変換 |
| F-5 | 実体ディレクトリへ統合しシンボリックリンク参照を全廃 |
| F-6 | WSL 固有の拒否ルールおよび関連フックを設定から除去 |
| F-7, NF-4, NF-5, NF-6 | 自動開発オーケストレーションを TypeScript 実装で移植 |
| F-8 | Node パッケージマネージャ経由のグローバルインストール |
| F-9 | 移植先スタックのテストフレームワークで等価テストを整備 |
| F-10 | 前提環境記述を Windows と Copilot 前提へ書き換え |
| NF-7 | オーケストレーション内で決定ログと試行ログを出力 |
| NF-8 | インストーラを Windows 互換のパッケージ公開または同等手段で提供 |

## 5. 代替案の検討

<!-- §4の実現方式に対する代替案。最低2案を比較。 -->

| 案 | 概要 | 採否 | 決定的理由 |
|----|------|------|------------|
| A: Node 系ランタイムで一括刷新 | TypeScript 実装 + バックエンド抽象 + 双方向配布 | **採用** | Windows 互換性と型安全性と Copilot 併用を同時に満たす |
| B: 既存 bash を温存しランチャのみ Windows 対応 | ラッパーだけ書き Copilot 直叩き | 却下 | Copilot 非対応と WSL 依存が構造的に解けない |
| C: PowerShell スクリプトへ移植 | 各 CLI を PowerShell で書き直し | 却下 | Linux 互換が崩れ AI バックエンド抽象の実装基盤も乏しい |
| D: Deno 単一バイナリ配布 | Deno で書き単一バイナリ化 | 却下 | Copilot エコシステムとの統合に実績が乏しく採用リスク高 |

## 6. 外部仕様 (External Specification)

<!-- ユーザ・運用者視点の振る舞い。箇条書き＋コード例。 -->

- 利用者は Windows ネイティブのシェルから配布 CLI を直接起動できる
- 利用者はバックエンド環境変数で Claude か Copilot を選択する
- 配布実行で対象リポジトリに Claude 向けスラッシュコマンド資産が配置される
- 配布実行で対象リポジトリに Copilot 向けプロンプト資産が配置される
- エスカレーション要件を検出した場合は即時中断し人間へ引き継ぐ
- インストール後は単一コマンド名で自動開発オーケストレータを起動できる
- パス拒否ルールと関連フックが存在しないため WSL 専用の副作用は生じない

## 7. E2Eテスト仕様

<!-- E2E テスト設計は
gate-criteria-rfc.md GATE-1 基準B に従うこと -->

| ID | 対応要件 | セットアップ手順 | 実行手順 | 期待するアウトカム |
|----|----------|------------------|----------|-------------------|
| T-1 | F-1, NF-1 | Windows 11 実機の PowerShell に Node LTS を導入し aidd 実リポジトリを clone | 配布 CLI をグローバルインストール後 PowerShell から呼び出す | 配布 CLI が Windows ネイティブで起動し正常終了する |
| T-2 | F-1, NF-2 | Ubuntu 実機に Node LTS を導入し aidd 実リポジトリを clone | 配布 CLI を Linux シェルから呼び出す | 同一 CLI が Linux でも起動し正常終了する |
| T-3 | F-2, F-3 | Windows 実機に Claude Code CLI を導入しバックエンド環境変数を Claude に設定 | 自動開発オーケストレータを実 spec 入力で起動する | 実 Claude セッションへヘッドレス送出され応答を取得する |
| T-4 | F-2, F-3 | Windows 実機に GitHub Copilot CLI を導入しバックエンド環境変数を Copilot に設定 | 同一の自動開発オーケストレータを実 spec 入力で起動する | 実 Copilot セッションへヘッドレス送出され応答を取得する |
| T-5 | F-3 | バックエンド環境変数を未定義の状態で配備 | 自動開発オーケストレータを実 spec 入力で起動する | 未定義を検知して即時エラー終了し実行を継続しない |
| T-6 | F-4 | 実 target リポジトリで配布 CLI を実行可能な状態にする | 配布 CLI を実行し両方の配布先ディレクトリを確認する | Claude 向けと Copilot 向けの両方に変換済みプロンプトが配置される |
| T-7 | F-4 | 中立プロンプトのうち 1 本に未知のツール名を含めた実 RFC を用意 | 配布 CLI を実行しマッピング結果を確認する | 未知ツール名を検知して変換エラーで中断し配布を行わない |
| T-8 | F-5 | aidd 実リポジトリを Windows 実機に clone した直後の状態 | ディレクトリ内のリンク種別を実 OS コマンドで確認する | シンボリックリンクは存在せず実体ディレクトリのみが存在する |
| T-9 | F-6 | 配布後の対象リポジトリで Claude Code を起動する | WSL 固有パスを参照する読み取りを試行する | 拒否されずに読み取りが成功し関連フックが登録されない |
| T-10 | F-7, NF-4 | 実 GitHub の aidd 実 PR でレビュー PASS 済みの実 slug を用意 | 自動開発オーケストレータに実 phase map を渡し起動する | 既マージ済み PR を検知してフェーズを再判定しスキップする |
| T-11 | F-7, NF-5 | 実 spec 入力に意図的に認証情報必須の処理を含める | 自動開発オーケストレータを起動する | エスカレーションマーカーを検出し終了コード 2 で即時中断する |
| T-12 | F-7, NF-6 | AI 呼び出しタイムアウトを極小値へ設定し起動する | 応答が遅延する実バックエンドへ送出する | タイムアウト経過で呼び出しを打ち切り再試行に遷移する |
| T-13 | F-8, NF-8 | Windows 実機のまっさらな Node LTS 環境を用意する | グローバルインストールコマンドを 1 回実行する | コマンドパスが通り配布 CLI 全本が呼び出し可能になる |
| T-14 | F-9 | 移植先スタックのテストフレームワークを実リポジトリに導入済み | テストコマンドを実行する | 全テストが成功し旧シェルテスト同等の観点が検証される |
| T-15 | F-10 | 配布後の対象リポジトリを閲覧する | ドキュメントの前提環境記述を確認する | Windows と Copilot 前提へ更新された記述が参照できる |
| T-16 | F-4, F-6 | WSL 実機で配布 CLI を実行する | 配布結果の 2 系統ディレクトリを確認する | Linux 環境でも拒否フックなしで両系統の配布が完了する |
| T-17 | F-5 | Windows 実機で aidd 実リポジトリに対し git status を実行する | リンク種別差分が無いことを確認する | リンクが存在しないためリンク権限関連の警告が発生しない |
| T-18 | F-8, NF-8 | インストール済みの Windows 実機で uninstall を実行する | 再度インストールコマンドを実行する | 再インストールが成功しコマンド名が再度パス解決可能になる |
| T-19 | F-9 | 実 GitHub の aidd 実 PR 上で移植先テストを CI で起動する | テストコマンドを実行する | 旧シェルテストと同等の観点項目がすべて成功判定となる |
| T-20 | F-10 | Windows 実機で配布後のドキュメントをブラウザで閲覧する | ドキュメント内の WSL 固有記述を検索する | WSL 固有記述が残存しておらず Windows 前提記述のみとなる |
| T-21 | F-1, NF-1 | Windows 実機から Node 未導入の状態でインストールする | 配布 CLI を起動する | Node 未導入を検知し人間向けエラーメッセージで即終了する |
| T-22 | F-2 | バックエンド環境変数を無関係な文字列に設定する | 自動開発オーケストレータを起動する | 未対応値として即時例外を送出し実行を進めない |
| T-23 | F-5 | Windows 管理者権限なしユーザで aidd 実リポジトリを clone | ディレクトリ内のリンク種別を確認する | 管理者権限要求が発生せず clone が完走する |
| T-24 | F-6 | 配布後の対象リポジトリ内で設定ファイルを読み込む | 拒否ルール列挙の件数を確認する | WSL 固有の拒否ルールと関連フックがゼロ件となる |
| T-25 | F-8 | Windows 実機でインストール先パスが PATH に未登録の状態 | 配布 CLI を起動する | コマンド未検出として人間向けメッセージで終了する |
| T-26 | F-9 | 移植先テスト実行中に依存 CLI が未導入の状態を再現する | テストコマンドを実行する | 依存未導入を検知して先頭で即座に失敗判定する |
| T-27 | F-10 | 実機 Linux で配布後のドキュメントを閲覧する | 実 Ubuntu 記述および Claude 専用記述を検索する | 旧前提の単一依存記述が残存しない |

## 8. ドキュメント編集仕様

<!-- システム概要ドキュメント等の作成・更新・削除。 -->

| 対象ファイル | 操作 | 変更内容 |
|-------------|------|----------|
| README.md | 更新 | 前提環境を Windows + Copilot 前提に書き換える |
| adapters/claude/CLAUDE.md | 更新 | 前提環境記述を Windows と Copilot 前提へ書き換える |
| adapters/claude/prompts/roles/process-strategist.md | 更新 | 前提環境セクションを Windows と Copilot 前提へ書き換える |
| adapters/claude/settings.json | 更新 | WSL 固有拒否ルールと関連フックを削除する |
| docs/architecture.md | 新規 | ディレクトリ責務とバックエンド抽象の構造オリエンテーション |
| docs/domain-model.md | 新規 | 配布規約とバックエンド切替の業務ルールを記述 |
| docs/api-overview.md | 新規 | バックエンド抽象インタフェースの設計意図を記述 |
| bin/ 配下旧シェル群 | 削除 | bash 実装を全廃し TypeScript 実装へ置換 |
| tests/test_git_utils.sh | 削除 | 移植先テストへ置換するため廃止 |
| install.sh | 削除 | Node 系インストーラへ置換するため廃止 |
| .claude シンボリックリンク | 削除 | 実体ディレクトリへ統合するため廃止 |

## 9. Task計画

<!-- 作業分割は
gate-criteria-rfc.md GATE-2 基準B に従うこと -->
<!-- 全作業項目は単一のPRで完遂すること。 -->
<!-- §7 のセットアップ手順に記載した環境準備は本セクションに「セットアップ」種別のタスクとして含めること。 -->

| # | 種別 | 作業内容 | 依存 |
|---|------|----------|------|
| 1 | セットアップ | Node LTS と GitHub Copilot CLI を実機に導入する | - |
| 2 | セットアップ | 実 Claude Code CLI を実機に導入しバックエンド環境変数を準備 | - |
| 3 | コード | 配布 CLI を TypeScript で再実装する | 1 |
| 4 | コード | AI バックエンド抽象インタフェースを実装する | 3 |
| 5 | コード | Claude バックエンド実装を追加する | 4 |
| 6 | コード | Copilot バックエンド実装を追加する | 4 |
| 7 | コード | 中立プロンプトを Claude 形式と Copilot 形式へ変換する処理 | 3 |
| 8 | コード | 自動開発オーケストレーションを TypeScript で移植する | 3, 4 |
| 9 | コード | リカバリループ・タイムアウト・エスカレーション検出を移植 | 8 |
| 10 | コード | シンボリックリンクを解消し実体ディレクトリへ統合する | - |
| 11 | コード | WSL 固有拒否ルールと関連フックを除去する | - |
| 12 | コード | 中立プロンプトマスタディレクトリを新設し配布元を切り替える | 7 |
| 13 | コード | Node 系インストーラを実装し旧インストーラを置換する | 3 |
| 14 | テスト | 移植先テストフレームワークで等価テストを再構築する | 3, 8, 9 |
| 15 | ドキュメント | README と CLAUDE ドキュメントの前提環境を更新する | - |
| 16 | ドキュメント | プロセス戦略家の前提環境記述を更新する | - |
| 17 | ドキュメント | 構造ドキュメント三点を新規作成する | 3, 4, 7 |
| 18 | 削除 | 旧 bash スクリプト群と旧テストと旧インストーラを削除 | 3, 8, 13, 14 |

### ロールバック基準と手順

- 実機 Windows と実機 Linux のいずれかで配布 CLI が起動しない場合に戻す
- 旧 bash 構成への git revert を実施し PR をクローズする

## 10. 前提条件・依存関係

| 種別 | 内容 |
|------|------|
| ランタイム | Node.js LTS が実機に導入されていること |
| 外部 CLI | GitHub CLI が利用可能であること |
| 外部 CLI | Claude Code CLI が利用可能であること |
| 外部 CLI | GitHub Copilot CLI が利用可能であること |
| アカウント | Claude Max Plan 相当のサブスクリプション |
| アカウント | GitHub Copilot で Claude モデル利用可のプラン |
| OS | Windows 11 もしくは Linux 互換ディストリビューション |

## 11. 詳細設計 (Detailed Design)

<!-- 箇条書き＋コード例。 -->
<!-- コードブロック間補足は2文以内の散文許可。 -->

- 配布 CLI は `bin/` 配下を `bin/src/` の TypeScript に置き、
  ビルド成果物を `bin/dist/` に出力する構成とする
- エントリーポイントは `csync`, `rfc-init`, `rfc-publish`,
  `spec-init`, `adev` の 5 本とし、`package.json` の
  `bin` フィールドでコマンド名を公開する
- ランタイムは Node.js LTS とし、TypeScript 実行は
  ビルド済み JS を `node` で起動する
- AI バックエンド抽象は以下のインタフェースで定義する

```ts
// bin/src/ai/backend.ts
export interface AiBackend {
  /** ヘッドレスで 1 問 1 答を行う */
  run(params: {
    prompt: string;
    allowedTools?: string[];
    timeoutSec: number;
  }): Promise<{ stdout: string; exitCode: number }>;
}

export function resolveBackend(): AiBackend {
  const kind = process.env.AI_BACKEND ?? "claude";
  switch (kind) {
    case "claude":
      return new ClaudeBackend();
    case "copilot":
      return new CopilotBackend();
    default:
      throw new Error(`未対応の AI_BACKEND: ${kind}`);
  }
}
```

未知値は即時例外で中断し、フォールバック等の延命を行わない。

- Claude バックエンドは `claude -p` 互換オプションで子プロセスを
  起動し、stdin にプロンプト本文をファイルリダイレクトで流す
- Copilot バックエンドは GitHub Copilot CLI のヘッドレス実行
  サブコマンドへ等価なプロンプトを送出し応答を収集する
- 共通ラッパは最大 3 試行のリカバリループと `CLAUDE_TIMEOUT`
  相当のタイムアウト安全弁を備え、`ESCALATION_REQUIRED`
  マーカー検出時に終了コード 2 で即時終了する

```ts
// bin/src/ai/recovery.ts
export async function runWithRecovery(
  backend: AiBackend,
  prompt: string,
  opts: { allowedTools: string[]; timeoutSec: number; maxAttempts?: number }
): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastError = "";
  for (let i = 1; i <= maxAttempts; i++) {
    const p = i === 1 ? prompt : buildRecoveryPrompt(prompt, lastError);
    const res = await backend.run({
      prompt: p,
      allowedTools: opts.allowedTools,
      timeoutSec: opts.timeoutSec,
    });
    if (res.stdout.includes("ESCALATION_REQUIRED")) {
      process.stdout.write(res.stdout);
      process.exit(2);
    }
    if (res.exitCode === 0) return res.stdout;
    lastError = res.stdout;
  }
  throw new Error(`最大試行回数(${maxAttempts})に到達`);
}
```

マーカー検出は stdout のみを対象とし、stderr は修復プロンプト
構築時の diagnostic として二次利用する。

- 中立プロンプトマスタは `adapters/commands/` に配置し、
  配布時に Claude 形式は `.claude/commands/*.md` として
  無加工コピー、Copilot 形式は `.github/prompts/*.prompt.md`
  として frontmatter と tool 記法を変換して書き出す

```ts
// bin/src/csync/convert.ts
export function toCopilotPrompt(src: string): string {
  const body = stripToolReferences(src); // Claude Tool 名 → `#tool:` 記法
  const header = [
    "---",
    "mode: agent",
    "description: aidd slash command (copilot)",
    "---",
    "",
  ].join("\n");
  return header + body;
}
```

Tool 名マッピング表は `bin/src/csync/tool-map.ts` に持ち、
未登録ツール検出時は例外で中断して配布を行わない。

- シンボリックリンク `.claude -> adapters/claude` は廃止し、
  `adapters/claude/` を正本、中立マスタを `adapters/commands/`
  に分離する
- 配布 CLI は `git rev-parse --show-toplevel` 相当を
  `simple-git` または `execa` 経由で解決し、
  Windows のドライブ文字を含むパスにも対応する
- 自動開発オーケストレーションはフェーズ検出を

```ts
// bin/src/adev/phase.ts
type Phase =
  | "RFC" | "RRFC" | "MERGE_RFC" | "IMP"
  | "RIMP" | "VFY" | "MERGE_IMPL" | "DONE";
export async function detectPhase(slug: string): Promise<Phase> {
  /* feature PR / review ファイル / ブランチ存在を順に判定 */
}
```

の形で実装し、旧 bash 実装と同順序・同条件で判定する。

- インストーラは `npm` 経由のグローバルインストールを想定し、
  `package.json` の `bin` フィールドで各 CLI 名を登録する
- WSL 固有拒否ルール（`/mnt/c` 配下の read/edit/write/bash 禁止）
  と対応 PreToolUse フックを設定から削除する

### 単体テスト仕様

| テスト対象 | 検証観点 |
|-----------|----------|
| バックエンド解決関数 | 環境変数値ごとに正しい実装を返すこと |
| バックエンド解決関数 | 未知値で即時例外となること |
| Claude バックエンド | 実 CLI 互換の引数組み立てが行われること |
| Copilot バックエンド | 実 CLI 互換の引数組み立てが行われること |
| リカバリラッパ | 初回成功で戻り値 0 を返すこと |
| リカバリラッパ | 初回失敗後 2 回目成功で戻り値 0 を返すこと |
| リカバリラッパ | 最大試行到達で例外となること |
| リカバリラッパ | エスカレーションマーカー検出で終了コード 2 |
| リカバリラッパ | タイムアウト超過で打ち切りとなること |
| 修復プロンプト構築 | 前回エラー本文と元プロンプトを含むこと |
| フェーズ検出関数 | 8 フェーズすべてで正しい値を返すこと |
| フェーズ序数化関数 | 既知入力と未知入力で既定値を返すこと |
| 日付プレフィクス除去 | 日付付き slug のみ除去されること |
| プロンプト変換 | Claude 形式から Copilot 形式へ frontmatter 付与 |
| プロンプト変換 | 未登録 Tool 名で変換が中断すること |
| インストーラ | 実行後にコマンド名がパス解決可能となること |
