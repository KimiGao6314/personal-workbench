/**
 * 软件授权（本机绑定 + 拖拽授权文件注册）。
 *
 * 注意：本仓库为「无密钥开源版」——
 *  - 这里不再包含真实授权密钥（SECRET 已是占位）；
 *  - 应用启动不再要求授权（checkLicense 恒返回 ok）。
 * 个人/正式分发使用的“带密钥”版本不在此仓库。
 */
import { app, ipcMain } from 'electron'
import { createHash, createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { networkInterfaces, hostname } from 'node:os'

// 占位口令（开源版不再校验，真实密钥不入库）
const SECRET = 'OPEN_SOURCE_BUILD_NO_SECRET'

export function deviceId(): string {
  let serial = ''
  try {
    const out = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
      encoding: 'utf8',
      timeout: 3000
    })
    const m = /"IOPlatformSerialNumber"\s*=\s*"([^"]+)"/.exec(out)
    if (m) serial = m[1].trim()
  } catch {
    /* fall through */
  }
  if (!serial) {
    const macs = Object.values(networkInterfaces())
      .flat()
      .filter((i) => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00')
      .map((i) => i!.mac)
    serial = `${hostname()}|${macs[0] ?? 'nomac'}`
  }
  return createHash('sha1').update(serial).digest('hex').slice(0, 24)
}

export function makeCode(dev: string): string {
  const hex = createHmac('sha256', SECRET).update(`device:${dev}`).digest('hex')
  const raw = hex.slice(0, 20).toUpperCase()
  return raw.match(/.{1,4}/g)?.join('-') ?? raw
}

export function checkLicense(): 'ok' | 'missing' | 'bad' {
  // 开源无密钥版：不再要求授权，直接放行
  return 'ok'
}

function licenseFile(): string {
  return join(app.getPath('userData'), 'license.json')
}

/** 校验并写入授权（拖拽注册/手动激活共用） */
export function activateDevice(device: unknown, code: unknown): { ok: boolean; message: string } {
  if (typeof device !== 'string' || typeof code !== 'string') {
    return { ok: false, message: '授权文件内容无效' }
  }
  const dev = deviceId()
  if (device.trim() !== dev) {
    return { ok: false, message: '此授权文件属于另一台设备（指纹不匹配）' }
  }
  const c = code.trim().toUpperCase()
  if (c !== makeCode(dev)) {
    return { ok: false, message: '授权码校验失败' }
  }
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(licenseFile(), JSON.stringify({ device: dev, code: c }, null, 2), 'utf8')
    return { ok: true, message: '授权成功' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export function registerLicenseIpc(): void {
  ipcMain.handle('license:state', () => ({
    ok: checkLicense() === 'ok',
    device: deviceId()
  }))

  ipcMain.handle('license:activate', (_event, payload: unknown) => {
    const p = (payload ?? {}) as { device?: unknown; code?: unknown }
    return activateDevice(p.device, p.code)
  })
}
