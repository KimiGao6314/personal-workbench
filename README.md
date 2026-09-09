# 我的工作台（personal-workbench）

一个只在本机运行的 **macOS 桌面工作台**，把常用的小工具收进一个玻璃质感窗口里：
待办清单、课程表、日程、项目管理、设备台账、快捷启动器、概览页。

当前版本：**1.1.0（正式版）**。本仓库为**无密钥开源版**——不需要任何授权码，克隆即可运行。

## 系统要求

| 系统 | 玻璃观感 | 说明 |
| --- | --- | --- |
| macOS 26（Tahoe） | 原生 **Liquid Glass** | 自动加载 `electron-liquid-glass` 原生视图 |
| macOS 15 / macOS 14 | 传统 **毛玻璃**（NSVisualEffectView） | 自动走 `vibrancy: under-window`，**不加载** 26 专属原生库 |

> 应用启动时会按系统版本自动选择上面的引擎，**同一份 App 在 macOS 14 / 15 / 26 上都可直接运行**，无需区分版本。

## 功能

- **概览页**：问候、迷你统计、自定义卡片布局（课表 / 待办 / 外借器材 / 项目 / 日程）
- **待办清单**：每日打卡、提醒时间、地点、人物、搜索与过滤
- **课程表**：一天 12 节次制；支持**教学周**（设置第 1 周第一天自动推算本周、按周查看）、
  导入 **.xlsx** 课表、识别开课周次（1-16周 / 单周 / 双周）、相邻同名课自动合并、一键清空
- **日程**：月历总览 + 当日列表；支持重复规则（每天 / 每工作日 / 每周末 / 自定义周几+单双周）、快速删除
- **项目管理**：作品 / 项目交付跟踪
- **设备台账**：设备记录 + 外借记录 + 照片证据
- **快捷启动器**：常用工程 / 文件夹 / 软件一键直达
- 本机数据存储（JSON），不联网、不上传

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面运行时 | Electron 44 |
| 界面 | React 19 + TypeScript |
| 构建 | electron-vite 5（Vite 7） |
| 包管理 | pnpm 11（allowBuilds：esbuild / electron） |

## 快速开始

```bash
pnpm install
pnpm dev               # 开发模式（热更新）
pnpm build             # 构建 out/
pnpm package           # 打包 .app 到 /Applications，并生成桌面 DMG
pnpm typecheck         # 类型检查（主进程 + 渲染进程）
```

打包脚本见 `scripts/package-app.sh`；增量更新包生成脚本见 `scripts/make-update-package.sh`。

## 目录结构

```text
personal-workbench/
├── src/
│   ├── main/                 # Electron 主进程（窗口/玻璃引擎/存储/授权/通知/照片）
│   ├── preload/index.ts      # contextBridge：只暴露 workbench.* 白名单 API
│   ├── shared/api.ts         # 主/渲染进程共享类型
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── App.tsx             # 外壳：侧边栏 + 顶栏 + 模块渲染
│           ├── global.css          # 玻璃半透明主题（深/浅两套）
│           ├── core/               # 注册表 / 数据 Hook / 通用组件
│           └── modules/            # overview/todo/timetable/agenda/assignments/gear/launcher
├── scripts/                 # 打包、DMG、增量更新、卸载器
└── electron.vite.config.ts
```

## 数据与隐私

所有数据只写进本机 `~/Library/Application Support/我的工作台/data/`（待办、课程表、日程、
设备台账、照片、背景、设置），**不联网、不上传**。

## 致谢

以下同学参与了测试版本的体验与反馈（按首字母排序 · 不分先后）：
杜秉宸、何彦驹、李子轩、乔雨阳、王昱臻、徐翊洋、赵思玛。
