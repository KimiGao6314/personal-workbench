#!/bin/bash
# ============================================================================
# 生成「卸载我的工作台」工具 App（AppleScript droplet）
# 产物：dist/卸载我的工作台.app（可双击；也可随 DMG/压缩包一起分发）
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="dist/卸载我的工作台.app"
rm -rf "$OUT"
osacompile -o "$OUT" scripts/uninstall-template.applescript

# 用工作台图标替换默认 droplet 图标（保持视觉一致）
if [ -f "dist/我的工作台.app/Contents/Resources/icon.icns" ]; then
  cp "dist/我的工作台.app/Contents/Resources/icon.icns" "$OUT/Contents/Resources/droplet.icns"
fi

# 改写显示名
/usr/libexec/PlistBuddy -c "Set :CFBundleName 卸载我的工作台" "$OUT/Contents/Info.plist" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 卸载我的工作台" "$OUT/Contents/Info.plist" 2>/dev/null || true

echo "已生成: $OUT"
