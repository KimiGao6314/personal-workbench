/**
 * useStore —— 工作台的「数据层 Hook」。
 *
 * 用法：useStore<T>('todo')，任何模块用一行代码即可获得
 * 某个 namespace 的持久数据 + 保存函数；数据跨模块自动同步
 * （同一 namespace 的所有 Hook 实例共享缓存与订阅）。
 *
 * 每个模块一个 namespace，落盘到 userData/data/<namespace>.json。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { StoreReadResult } from '@shared/api'

export interface UseStoreResult<T> {
  /** 首次从磁盘读完后为 true */
  ready: boolean
  /** 当前数据；文件不存在时为 null（模块自行按默认值处理） */
  data: T | null
  /** 读取失败时的错误信息（文件损坏等），正常为 null */
  error: string | null
  /**
   * 保存：传新值，或传 (prev) => next 的函数。
   * 乐观更新：本地立即生效并广播给其它订阅方，异步落盘。
   *
   * 首次写入（文件尚不存在、data === null）时只接受「完整新值」，
   * 不接受函数——请先显式写入默认结构，之后再用函数式更新：
   *   save(EMPTY_STATE)  // 首次：生成默认文件
   *   save((p) => ({ ...p, k: 1 }))  // 之后：函数式更新
   */
  save: (next: T | ((prev: T) => T)) => void
}

// ---------- 模块级共享状态：缓存 / 订阅 / 去重的读取 ----------
const cache = new Map<string, unknown>()
const listeners = new Map<string, Set<(value: unknown) => void>>()
const inflight = new Map<string, Promise<StoreReadResult<unknown>>>()

function subscribe(ns: string, fn: (value: unknown) => void): () => void {
  let set = listeners.get(ns)
  if (!set) {
    set = new Set()
    listeners.set(ns, set)
  }
  set.add(fn)
  return () => {
    set!.delete(fn)
  }
}

function broadcast(ns: string): void {
  const value = cache.get(ns)
  const set = listeners.get(ns)
  if (set) for (const fn of set) fn(value)
}

async function ensureLoaded(ns: string): Promise<StoreReadResult<unknown>> {
  if (cache.has(ns)) return { ok: true, value: cache.get(ns) }
  let pending = inflight.get(ns)
  if (!pending) {
    pending = (async () => {
      try {
        const res = await window.workbench!.store.read(ns)
        if (res.ok && res.value !== null) cache.set(ns, res.value)
        return res
      } finally {
        inflight.delete(ns)
      }
    })()
    inflight.set(ns, pending)
  }
  return pending
}

// ---------- Hook ----------
export function useStore<T>(ns: string): UseStoreResult<T> {
  const [state, setState] = useState<{
    ready: boolean
    data: T | null
    error: string | null
  }>(() =>
    cache.has(ns)
      ? { ready: true, data: cache.get(ns) as T, error: null }
      : { ready: false, data: null, error: null }
  )

  // 当前数据的最新引用，供 save 闭包读取
  const dataRef = useRef<T | null>(state.data)
  dataRef.current = state.data

  useEffect(() => {
    let alive = true
    const off = subscribe(ns, (value) => {
      if (!alive) return
      setState({ ready: true, data: value as T, error: null })
    })
    if (!cache.has(ns)) {
      ensureLoaded(ns)
        .then((res) => {
          if (!alive) return
          if (res.ok) {
            setState({
              ready: true,
              data: cache.has(ns) ? (cache.get(ns) as T) : null,
              error: null
            })
          } else {
            setState({ ready: true, data: null, error: res.error })
          }
        })
        .catch((err: unknown) => {
          if (!alive) return
          setState({ ready: true, data: null, error: String(err) })
        })
    }
    return () => {
      alive = false
      off()
    }
  }, [ns])

  const save = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = dataRef.current
      let value: T
      if (prev === null) {
        if (typeof next === 'function') {
          // 还没读到/建立数据，函数式更新无从谈起，忽略
          console.warn(`[useStore:${ns}] 数据尚未就绪，请先写入初始值再使用函数式更新`)
          return
        }
        value = next
      } else {
        value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      }
      cache.set(ns, value)
      dataRef.current = value
      setState({ ready: true, data: value, error: null })
      broadcast(ns)
      window.workbench!.store.write(ns, value).catch((err: unknown) => {
        console.error(`[useStore:${ns}] 写入失败`, err)
      })
    },
    [ns]
  )

  return { ready: state.ready, data: state.data, error: state.error, save }
}
