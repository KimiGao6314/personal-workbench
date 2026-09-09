# 我的工作台（personal-workbench）

只供你自己使用的 macOS 桌面工作台。当前是**模块化框架 + 待办清单**第一版，
界面采用 **Liquid Glass（macOS 26 Tahoe 原生毛玻璃）** 观感，深浅色自动跟随系统。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面运行时 | Electron 44 |
| 界面 | React 19 + TypeScript |
| 构建 | electron-vite 5（Vite 7） |
| 数据 | 主进程 JSON 存储，`userData/data/<namespace>.json` |

## 快速开始

```bash
pnpm install          # 已配置 allowBuilds（esbuild/electron）
pnpm dev              # 开发模式（热更新）
pnpm build && pnpm start   # 构建并运行产物
pnpm typecheck        # 类型检查（主进程 + 渲染进程）
```

> 首次安装：`pnpm install` 用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 跳过 Electron 下载，
> 然后把 `../dsh-whale-pet/node_modules/electron/{dist,path.txt}` 复制到本工程的
> `node_modules/electron/`（本机 GitHub 不通，桌宠工程已有同版本 v44 二进制）。

## Liquid Glass 是怎么做的

- **窗口玻璃**：`src/main/window.ts` 打开 `vibrancy: 'under-window'`
  （macOS 26 上 Electron 自动渲染成系统 Liquid Glass 材质），背景设为全透明。
- **界面半透明**：`global.css` 里所有面板/卡片/输入框都是半透明色（`--panel` 等变量），
  玻璃从透明处透出来；整份配色分深/浅两套，`prefers-color-scheme` 自动切换。
- **微调材质**：`WB_VIBRANCY=sidebar pnpm dev` 可换材质
  （under-window / sidebar / hud / popover / content …），默认 under-window。
- **视觉自检**：`WB_SHOT_PATH=/tmp/a.png pnpm start` 会截图后自动退出
  （capturePage 不含原生玻璃层，玻璃观感以肉眼为准）。

## 目录结构

```text
personal-workbench/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 生命周期 / 单实例
│   │   ├── window.ts         # 窗口 + Liquid Glass vibrancy
│   │   ├── store.ts          # 通用 JSON 存储（IPC: store:read/write）
│   │   └── screenshot.ts     # 开发截图自检（WB_SHOT_PATH 触发）
│   ├── preload/index.ts      # contextBridge：只暴露 workbench.* 白名单 API
│   ├── shared/api.ts         # 主/渲染进程共享类型
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── App.tsx             # 外壳：侧边栏 + 顶栏 + 模块渲染
│           ├── global.css          # Liquid Glass 半透明主题（深/浅两套）
│           ├── core/
│           │   ├── registry.tsx    # ★ 模块注册表（加模块改这里）
│           │   ├── shell.tsx       # 导航 Context（useShell）
│           │   └── useStore.ts     # ★ 数据 Hook：useStore('namespace')
│           └── modules/
│               ├── overview/       # 概览页（问候/统计/入口卡片）
│               └── todo/           # 待办清单（model.ts + TodoModule + TodoBadge）
└── pnpm-workspace.yaml   # pnpm 11 的 allowBuilds 白名单
```

## 新增一个模块（三步）

1. 建目录 `src/renderer/src/modules/<name>/`，写组件：
   ```tsx
   const data = useStore<MyState>('myns')   // 自动持久化 + 跨模块同步
   ```
2. 在 `core/registry.tsx` 追加一条：
   ```tsx
   { id: 'myns', title: '我的模块', icon: '🧩', description: '…',
     component: MyModule, badge: MyBadge /* 可选：侧边栏角标 */ }
   ```
3. 侧边栏与概览页自动出现该模块；`⌘/Ctrl + 数字键` 可快速切换。

> 数据只会写进 `~/Library/Application Support/personal-workbench/data/`，
> 不联网、不上传，纯本机私有。

## 已内置功能（待办模块）

- 回车添加任务；勾选完成/取消；悬停 ✕ 删除；双击行内编辑
- 全部 / 进行中 / 已完成 过滤（带数量）+「清除已完成」
- 侧边栏实时「进行中」角标；概览页统计与入口卡片同步刷新
