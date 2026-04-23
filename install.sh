#!/usr/bin/env bash
# aidd グローバルインストーラ
#
# aidd が提供する CLI ツールを ~/.local/bin/ にシンボリックリンクする。
# スクリプト自身の位置から aidd リポジトリのルートを自己発見するため、
# 任意の clone 先で動作する。
#
# 使用方法:
#   ./install.sh
#
# 環境変数:
#   AIDD_INSTALL_DIR: インストール先ディレクトリ (既定: ~/.local/bin)
set -euo pipefail

AIDD_ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
INSTALL_DIR="${AIDD_INSTALL_DIR:-$HOME/.local/bin}"

mkdir -p "$INSTALL_DIR"

TOOLS=(csync rfc-init rfc-publish spec-init adev.sh)
for tool in "${TOOLS[@]}"; do
  src="$AIDD_ROOT/bin/$tool"
  dst="$INSTALL_DIR/$tool"
  if [ ! -f "$src" ]; then
    echo "エラー: $src が存在しません。" >&2
    exit 1
  fi
  ln -sf "$src" "$dst"
  echo "  インストール: $dst -> $src"
done

echo ""
echo "完了: aidd ツールを $INSTALL_DIR にインストールしました。"

if ! echo ":$PATH:" | grep -q ":$INSTALL_DIR:"; then
  cat <<MSG

警告: $INSTALL_DIR が PATH に含まれていません。
  ~/.profile または ~/.bashrc / ~/.zshrc に以下を追記してください:
    export PATH="$INSTALL_DIR:\$PATH"
MSG
fi
