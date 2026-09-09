/**
 * 照片工具（渲染层）：把选中的文件读成 dataURL、持久化到磁盘、读回展示。
 */

export interface PickedPhoto {
  /** 主进程保存后返回的文件名 */
  name: string
  /** 本次会话内直接可展示的 dataURL */
  dataUrl: string
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error ?? new Error('读取文件失败'))
    fr.readAsDataURL(file)
  })
}

/** 把用户选的文件变成 PickedPhoto（立即落盘，name 供记录持久化） */
export async function pickPhotos(files: FileList | File[] | null): Promise<PickedPhoto[]> {
  if (!files) return []
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
  const out: PickedPhoto[] = []
  for (const f of list) {
    try {
      const dataUrl = await readFileAsDataUrl(f)
      const res = await window.workbench?.photos.save(dataUrl)
      if (res?.ok && res.name) out.push({ name: res.name, dataUrl })
    } catch {
      /* 跳过坏文件 */
    }
  }
  return out
}

/** 按文件名从磁盘读回 dataURL（跨会话展示用） */
export async function loadPhoto(name: string): Promise<string | null> {
  try {
    const res = await window.workbench?.photos.read(name)
    return res?.ok && res.dataUrl ? res.dataUrl : null
  } catch {
    return null
  }
}

/** 删除已保存的照片文件（取消借出 / 删除记录时回收孤儿文件） */
export async function deletePhoto(name: string): Promise<void> {
  try {
    await window.workbench?.photos.delete(name)
  } catch {
    /* 忽略删除失败（不阻塞主流程） */
  }
}
