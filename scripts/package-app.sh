#!/bin/bash
# ============================================================================
# 打包 personal-workbench 为标准 macOS .app 并安装到 /Applications
# 产物：dist/我的工作台.app（并复制到 /Applications/我的工作台.app）
# 依赖：ditto、sips、iconutil、PlistBuddy（macOS 自带）+ pnpm build
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

APP_NAME="我的工作台"
APP_DIR="${APP_NAME}.app"
BUNDLE_ID="com.local.workbench"
VERSION="1.1.0"
SRC_APP="node_modules/electron/dist/Electron.app"
DIST="dist/$APP_DIR"
DEST="/Applications/$APP_DIR"

echo "==> 1/6 先构建前端产物 (out/)"
pnpm build

if [ ! -d "$SRC_APP" ]; then
  echo "缺少 Electron.app 模板，先运行: node node_modules/electron/install.js"
  exit 1
fi

echo "==> 2/6 复制 Electron.app -> $DIST"
rm -rf "$DIST"
mkdir -p dist
ditto "$SRC_APP" "$DIST"

echo "==> 3/6 写入应用代码 (Contents/Resources/app)"
APP_RES="$DIST/Contents/Resources/app"
rm -rf "$APP_RES"
mkdir -p "$APP_RES"
cp package.json "$APP_RES/"
cp -R out "$APP_RES/out"

echo "==> 3.5/6 安装运行期依赖（主进程外部化的 electron-liquid-glass）"
STAGE="/tmp/wb-runtime-stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ name: "wb-runtime", private: true, dependencies: { "electron-liquid-glass": "^1.1.1" } }, null, 2))' "$STAGE/package.json"
(cd "$STAGE" && npm install --no-audit --no-fund --loglevel=error)
mkdir -p "$APP_RES/node_modules"
cp -R "$STAGE/node_modules/electron-liquid-glass" "$APP_RES/node_modules/"
# 把需要的传递依赖一起带上（bindings / node-addon-api / node-gyp-build）
for p in bindings node-addon-api node-gyp-build file-uri-to-path; do
  if [ -d "$STAGE/node_modules/$p" ]; then
    cp -R "$STAGE/node_modules/$p" "$APP_RES/node_modules/"
  fi
done

echo "==> 4/6 生成并安装图标 icon.icns"
ICON_PNG="/tmp/wb-icon-1024.png"
node_modules/.bin/electron scripts/gen-icon.js "$ICON_PNG"
ICONSET="/tmp/wb.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$ICON_PNG" --out "$ICONSET/icon_${s}x${s}.png" > /dev/null
  sips -z "$((s * 2))" "$((s * 2))" "$ICON_PNG" --out "$ICONSET/icon_${s}x${s}@2x.png" > /dev/null
done
iconutil -c icns "$ICONSET" -o "$DIST/Contents/Resources/icon.icns"
rm -f "$DIST/Contents/Resources/electron.icns"

echo "==> 5/6 改写 Info.plist"
PLIST="$DIST/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleName $APP_NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName $APP_NAME" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $BUNDLE_ID" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleIconFile icon.icns" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$PLIST" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :CFBundleVersion string 1" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSHighResolutionCapable bool true" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :LSApplicationCategoryType string public.app-category.productivity" "$PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :NSAppleEventsUsageDescription string 用于在日程中读取 macOS 本地日历（如中国节假日）并显示。" "$PLIST" 2>/dev/null || true

echo "==> 6/6 安装到 $DEST"
rm -rf "$DEST"
ditto "$DIST" "$DEST"

# 6.0 ad-hoc 签名（跨机安装降低 Gatekeeper「已损坏/无法验证开发者」拦截）
echo "==> 6.1/6 ad-hoc 签名"
codesign --force --deep --sign - "$DIST" 2>/dev/null || codesign --force --sign - "$DIST"
codesign --force --deep --sign - "$DEST" 2>/dev/null || codesign --force --sign - "$DEST"

# 6.1 自动同步桌面 DMG（最新 App + 卸载器 + 应用程序入口）
#     快速迭代可用 SKIP_DMG=1 跳过
if [ "${SKIP_DMG:-0}" = "1" ]; then
  echo "==> 6.2/6 已跳过桌面 DMG 生成（SKIP_DMG=1）"
else
  echo "==> 6.2/6 生成桌面 DMG（最新版）"
  if [ ! -f "scripts/make-uninstaller.sh" ]; then
    echo "警告：未找到卸载器脚本，DMG 将只含 App 与入口"
  else
    ./scripts/make-uninstaller.sh > /dev/null
  fi
  STAGE=$(mktemp -d /tmp/wb-dmg.XXXXXX)
  cp -R "$DIST" "$STAGE/"
  if [ -d "dist/卸载我的工作台.app" ]; then
    cp -R "dist/卸载我的工作台.app" "$STAGE/"
  fi
  ln -s /Applications "$STAGE/应用程序"
  OUT_DMG="${HOME}/Desktop/我的工作台.dmg"
  rm -f "$OUT_DMG"
  # volname 特意用“我的工作台安装”，避免与安装到 /Applications 的同名 App 在 Finder 里挂载成同一卷导致“打不开”
  hdiutil create -volname "我的工作台安装" -noscrub -srcfolder "$STAGE" -ov -format UDZO "$OUT_DMG" > /dev/null
  rm -rf "$STAGE"
  echo "  桌面 DMG 已同步: $OUT_DMG"
fi

echo ""
echo "完成："
echo "  本机产物: $DIST"
echo "  已安装 : $DEST"
/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" "$DEST/Contents/Info.plist"
