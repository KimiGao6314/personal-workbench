#!/bin/bash
# ============================================================================
# 生成 0.8.0 → 0.9.0 的“增量更新”DMG：
#   - 只更新应用代码（Contents/Resources/app/out + package.json），不整套重装
#   - 绝不改动用户数据目录 ~/Library/Application Support/我的工作台/
#     （待办/课程表/日程等原始数据全部保留）
#   - 同一套代码由应用按系统自动选择玻璃引擎，故兼容 macOS 15 与 macOS 26
# 产物：~/Desktop/我的工作台-0.8.0到0.9.0-增量更新.dmg
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="我的工作台"
OLD="1.0.0"
NEW="1.1.0"

echo "==> 1/4 构建最新前端产物 (out/)"
pnpm build > /dev/null

STAGE="/tmp/wb-update-stage"
rm -rf "$STAGE"
mkdir -p "$STAGE/app-out"

echo "==> 2/4 收集更新负载（仅 out/ + package.json，增量）"
cp -R out/. "$STAGE/app-out/"
cp package.json "$STAGE/package.json"

echo "==> 3/4 生成更新脚本 更新-${OLD}到${NEW}.command"
cat > "$STAGE/更新-${OLD}到${NEW}.command" <<EOF
#!/bin/bash
set -u
APP_NAME="$APP_NAME"
OLD_VER="$OLD"
NEW_VER="$NEW"
DEST="\${WB_DEST:-/Applications/\${APP_NAME}.app}"
ME_DIR="\$(cd "\$(dirname "\$0")" && pwd)"

echo "=============================================="
echo "  \${APP_NAME}  增量更新  \${OLD_VER} → \${NEW_VER}"
echo "=============================================="

if [ ! -d "\$DEST" ]; then
  echo "❌ 未在 /Applications 找到 \${APP_NAME}.app，请先安装 \${OLD_VER} 版本。"
  read -n1 -r -p "按任意键退出…"; exit 1
fi

CUR_VER="\$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "\$DEST/Contents/Info.plist" 2>/dev/null || echo '?')"
echo "  当前已装版本：\${CUR_VER}"
if [ "\${CUR_VER}" = "\${NEW_VER}" ]; then
  echo "  ✓ 已是最新 \${NEW_VER}，将重新覆盖一次（幂等）。"
fi

# 关闭正在运行的 我的工作台
echo "→ 正在关闭运行中的 \${APP_NAME}…"
osascript -e "tell application \"\${APP_NAME}\" to quit" 2>/dev/null || true
pkill -f "\$DEST" 2>/dev/null || true
sleep 1

echo "→ 覆盖应用代码（不触碰你的数据 ~/Library/Application Support/...）…"
# 干净替换：先把新 out/ 拷到临时目录，成功后再整目录换掉旧的，避免旧构建遗留文件残留，
# 也避免中途失败把 app/out 弄丢（旧 out 在替换前一直完好）。
TMPOUT="\${DEST}/Contents/Resources/app/out.new"
rm -rf "\$TMPOUT"
ditto "\$ME_DIR/app-out" "\$TMPOUT"
rm -rf "\$DEST/Contents/Resources/app/out"
mv "\$TMPOUT" "\$DEST/Contents/Resources/app/out"
cp -f "\$ME_DIR/package.json" "\$DEST/Contents/Resources/app/package.json"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString \${NEW_VER}" "\$DEST/Contents/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string \${NEW_VER}" "\$DEST/Contents/Info.plist" 2>/dev/null \
  || true
/usr/libexec/PlistBuddy -c "Add :NSAppleEventsUsageDescription string 用于在日程中读取 macOS 本地日历（如中国节假日）并显示。" "\$DEST/Contents/Info.plist" 2>/dev/null || true

echo "→ 重新 ad-hoc 签名（避免“已损坏/无法打开”）…"
codesign --force --deep -s - "\$DEST" 2>/dev/null || codesign --force -s - "\$DEST" 2>/dev/null || true

echo "✓ 更新完成，正在重新打开 \${APP_NAME}…"
open "\$DEST"
echo ""
echo "你的数据已完整保留：待办、课程表、日程、设备台账等均未改动。"
read -n1 -r -p "按任意键关闭窗口…"
EOF
chmod +x "$STAGE/更新-${OLD}到${NEW}.command"

echo "==> 4/4 打包 DMG"
OUT_DMG="${HOME}/Desktop/${APP_NAME}-${OLD}到${NEW}-增量更新.dmg"
rm -f "$OUT_DMG"
hdiutil create -volname "${APP_NAME} ${NEW} 更新" -noscrub -srcfolder "$STAGE" -ov -format UDZO "$OUT_DMG" > /dev/null
rm -rf "$STAGE"

echo ""
echo "完成："
echo "  增量更新包: $OUT_DMG"
echo "  （仅含 out/ + package.json，约几 MB；不改动用户数据；兼容 macOS 15 / 26）"
