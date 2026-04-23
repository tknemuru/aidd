# モバイル環境からの vdev フロー操作最適化

## 背景

育児・家事の合間に vdev フロー（RFC-driven Development Workflow）を用いた開発を継続したい。現状、PC から離れることでリードタイムが発生し、**人間の指示出し・意思決定・レビューが最大のボトルネック**になっている。

## 現状分析

### ヒューマンタッチポイントの特定

vdev フローにおいて人間の介入が必要なポイントは以下の5つ。

| タッチポイント | タイミング | 内容 |
|---|---|---|
| 開発指示の発行 | `/rfc` or `/arfc` の起動 | テーマ・要件の伝達 |
| RFC PR のレビュー・マージ | Stage 2 完了後 | 設計内容の確認と承認 |
| 実装指示の発行 | `/imp` or `/aimp` の起動 | 実装開始のトリガー |
| 実装 PR のレビュー・マージ | Stage 3 完了後 | コード変更の確認と承認 |
| PR コメント対応の確認 | `/upr` 後 | 修正結果の確認 |

`/arfc` と `/aimp` により RFC 作成〜AI レビューは自動化済みだが、**ステージ間の接続（人間のトリガーとマージ）が断絶**しており、これがリードタイムの主因。

## 提案

3つのレイヤーで段階的に改善する。

### Layer 1: モバイルからの操作経路確保

#### A. Tailscale + SSH（推奨）

Tailscale（WireGuard ベースの VPN）を WSL とスマホに導入し、セキュアなリモート SSH 接続を確立する。ポート開放不要でセキュリティリスクが低い。

```bash
# WSL側
sudo apt install openssh-server
sudo sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sudo service ssh start
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

スマホ側は Tailscale アプリ + SSH クライアント（Termius 等）をインストール。

#### B. 直接 SSH（代替案）

Tailscale を使わない場合は、Windows 側のポートフォワーディングで WSL に接続する。

```bash
# Windows PowerShell（管理者）
netsh interface portproxy add v4tov4 listenport=2222 listenaddress=0.0.0.0 connectport=2222 connectaddress=$(wsl hostname -I)
netsh advfirewall firewall add rule name="WSL SSH" dir=in action=allow protocol=TCP localport=2222
```

### Layer 2: 入力負荷の軽減

#### A. SSH スニペット登録

SSH クライアントのスニペット機能に頻出コマンドを登録し、スマホからの入力量を削減する。

```
arfc:  claude "/arfc <テーマ>"
aimp:  claude "/aimp <RFC slug>"
fix:   claude "/fix <テーマ>"
upr:   claude "/upr"
```

#### B. スマホ音声入力の活用

iOS/Android 標準キーボードの音声入力を SSH ターミナルのテキスト入力に直接使用できる。ワンライナーのラッパースクリプトと組み合わせると効果的。

```bash
#!/bin/bash
# voice-dev.sh - 引数をそのまま Claude に渡す
claude "/arfc $1"
```

#### C. GitHub Mobile での PR レビュー・マージ

GitHub Mobile アプリ（iOS/Android）で PR の差分確認・Approve・マージがワンタップで可能。RFC PR・実装 PR のマージのリードタイムを大幅に削減できる。

### Layer 3: ワークフロー自体の最適化

#### A. `/fix` コマンドの積極活用

リスクの低い変更は `/fix --merge` で RFC 作成〜実装〜マージまで一気通貫で実行。AI レビューをスキップし、人間の判断ポイントを削減する。

#### B. パイプラインスクリプトの新設（将来案）

`/arfc` 完了後に自動で通知し、マージ待ちであることを伝える仕組み。SSH で起動しておけば、家事の合間に GitHub Mobile で PR をマージ → SSH で次のコマンドを1行打つだけで開発が進む。

#### C. GitHub Actions による自動トリガー（将来案）

RFC PR のマージをトリガーに、実装フェーズの開始を自動化する。完全な自動化により人間のタッチポイントをマージ操作のみに集約できる。

## 推奨導入順序

| 優先度 | 施策 | 導入コスト | 効果 |
|---|---|---|---|
| 1 | GitHub Mobile で PR レビュー・マージ | ゼロ | マージのリードタイム大幅削減 |
| 2 | Tailscale + SSH でスマホから Claude 操作 | 30分程度 | どこからでもコマンド発行可能 |
| 3 | SSH スニペット登録 | 10分 | 入力負荷の削減 |
| 4 | `/fix` の積極活用 | ゼロ | 小規模変更のタッチポイント削減 |
| 5 | パイプラインスクリプト新設 | RFC で設計 | ステージ間接続の自動化 |

## 結論

最も費用対効果が高いのは **GitHub Mobile + Tailscale SSH** の組み合わせ。これにより育児・家事の合間でも「スマホから指示 → AI が自動作業 → スマホで PR マージ」のサイクルが回せるようになり、人間のリードタイムを数分単位に圧縮できる。
