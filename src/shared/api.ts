/**
 * 渲染进程与主进程之间的共享类型（纯类型，无运行时逻辑）。
 * 同时被 tsconfig.node.json 与 tsconfig.web.json 引入。
 */

// ---------- 本地文件能力（主进程实现见 src/main/shell.ts） ----------

export interface OpenPathResult {
  ok: boolean
  /** 失败时的原因（shell.openPath 返回的报错文案） */
  error?: string
}

export interface PickResult {
  ok: boolean
  /** 用户选择的路径；取消时为 null */
  path: string | null
  error?: string
}

export interface IconResult {
  ok: boolean
  /** 文件/App 的系统图标（PNG data URL）；失败时为空 */
  dataUrl?: string
  error?: string
}

export interface WorkbenchShell {
  /** 在系统默认应用中打开文件 / 文件夹 / .app（LaunchServices） */
  openPath(p: string): Promise<OpenPathResult>
  /** 在 Finder 中显示 */
  showInFolder(p: string): Promise<OpenPathResult>
  /** 打开外部链接（http/https/mailto） */
  openExternal(url: string): Promise<OpenPathResult>
  /** 原生对话框选一个文件 */
  pickFile(): Promise<PickResult>
  /** 原生对话框选一个文件夹 */
  pickDir(): Promise<PickResult>
  /** 取文件/文件夹/App 的系统图标（跟随文件本身） */
  getFileIcon(p: string): Promise<IconResult>
  /** 切换窗口全屏/退出全屏（用于界面内“退出全屏”按钮，规避系统红绿灯 bug） */
  toggleFullscreen(): Promise<void>
}

// ---------- 数据存储（主进程实现见 src/main/store.ts） ----------

export type Namespace = string

export interface PhotoSaveResult {
  ok: boolean
  /** 保存后的文件名（存进记录里用） */
  name?: string
  error?: string
}

export interface PhotoReadResult {
  ok: boolean
  dataUrl?: string
  error?: string
}

export interface WorkbenchPhotos {
  /** 保存一张图片（dataURL），落盘 userData/photos，返回文件名 */
  save(dataUrl: string): Promise<PhotoSaveResult>
  /** 按文件名读回图片 dataURL */
  read(name: string): Promise<PhotoReadResult>
  /** 删除照片文件（取消借出 / 删除记录时回收） */
  delete(name: string): Promise<{ ok: boolean; error?: string }>
}

export interface BgPickResult {
  ok: boolean
  /** 保存到 userData/backgrounds 后的文件名；取消为 null */
  file?: string | null
  error?: string
}

export interface WorkbenchBackground {
  /** 选择并导入背景图片，返回文件名 */
  pick(): Promise<BgPickResult>
  /** 按文件名读回 dataURL */
  read(name: string): Promise<PhotoReadResult>
}

export interface LicenseStateResult {
  ok: boolean
  /** 本机设备指纹 */
  device: string
}

export interface WorkbenchNotify {
  /** 弹系统通知 */
  show(title: string, body: string): Promise<{ ok: boolean; error?: string }>
}

export interface WorkbenchLicense {
  /** 查询授权状态与本机指纹 */
  state(): Promise<LicenseStateResult>
  /** 用授权文件里的 device+code 激活（主进程校验指纹） */
  activate(device: string, code: string): Promise<{ ok: boolean; message: string }>
}

// ---------- 系统日历（主进程实现见 src/main/calendar.ts） ----------

export interface CalendarEvent {
  /** YYYY-MM-DD */
  date: string
  title: string
  allDay: boolean
  /** HH:mm（全天事件为 00:00） */
  time: string
}

export interface WorkbenchCalendar {
  /** 读取 macOS 本地日历在 [from, to] 范围内的事件 */
  events(from: string, to: string): Promise<CalendarEvent[]>
}

export interface StoreReadOk<T> {
  ok: true
  /** 文件不存在时返回 null，由各模块自行决定用默认值 */
  value: T | null
}

export interface StoreFail {
  ok: false
  error: string
}

export type StoreReadResult<T> = StoreReadOk<T> | StoreFail
export type StoreWriteResult = { ok: true } | StoreFail

export interface WorkbenchBridge {
  /** 运行平台（darwin / win32 / linux …） */
  platform: string
  versions: {
    electron: string
    chrome: string
    node: string
  }
  store: {
    read<T = unknown>(ns: Namespace): Promise<StoreReadResult<T>>
    write<T = unknown>(ns: Namespace, data: T): Promise<StoreWriteResult>
  }
  shell: WorkbenchShell
  photos: WorkbenchPhotos
  bg: WorkbenchBackground
  license: WorkbenchLicense
  notify: WorkbenchNotify
  calendar: WorkbenchCalendar
}
