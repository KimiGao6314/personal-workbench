#!/bin/bash
# ============================================================================
# 一键出两个发布 DMG（macOS 26 版 + macOS 15 兼容版）并同步桌面
# 用法: ./scripts/build-releases.sh
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> 1/3 构建 + 打包 App（自动同步 /Applications 与桌面主 DMG）"
pnpm run package

echo "==> 2/3 生成 macOS 15 兼容版 DMG"
./scripts/make-uninstaller.sh > /dev/null
STAGE=$(mktemp -d /tmp/wb15.XXXXXX)
cp -R "dist/我的工作台.app" "$STAGE/我的工作台.app"
cp -R "dist/卸载我的工作台.app" "$STAGE/卸载我的工作台.app"
ln -s /Applications "$STAGE/Applications"
OUT15="$HOME/Desktop/我的工作台-macOS15.dmg"
rm -f "$OUT15"
hdiutil create -volname "我的工作台 macOS15" -srcfolder "$STAGE" -ov -format UDZO "$OUT15" > /dev/null
rm -rf "$STAGE"

echo "==> 3/3 重启正式版"
osascript -e 'tell application "我的工作台" to quit' > /dev/null 2>&1 || true
sleep 2
ps aux | grep '[A]pplications/我的工作台.app/Contents/MacOS/Electron' | awk '{print $2}' | xargs -r kill > /dev/null 2>&1 || true
sleep 1
rm -f "$HOME/Library/Application Support/我的工作台/SingletonLock" \
      "$HOME/Library/Application Support/我的工作台/SingletonSocket" \
      "$HOME/Library/Application Support/我的工作台/SingletonCookie"
open "/Applications/我的工作台.app"

echo ""
echo "完成 ✅"
ls -lh "$HOME/Desktop/我的工作台.dmg" "$HOME/Desktop/我的工作台-macOS15.dmg"
