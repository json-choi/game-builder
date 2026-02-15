import { useState, useCallback, useRef } from 'react'

export type ToastLevel = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  level: ToastLevel
  message: string
  duration: number
}

let toastCounter = 0

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const addToast = useCallback((level: ToastLevel, message: string, duration = 4000) => {
    const id = `toast-${++toastCounter}-${Date.now()}`
    const toast: Toast = { id, level, message, duration }
    setToasts((prev) => [...prev, toast])

    if (duration > 0) {
      const timer = setTimeout(() => {
        removeToast(id)
      }, duration)
      timersRef.current.set(id, timer)
    }

    return id
  }, [removeToast])

  const success = useCallback((message: string, duration?: number) => addToast('success', message, duration), [addToast])
  const error = useCallback((message: string, duration?: number) => addToast('error', message, duration ?? 6000), [addToast])
  const warning = useCallback((message: string, duration?: number) => addToast('warning', message, duration), [addToast])
  const info = useCallback((message: string, duration?: number) => addToast('info', message, duration), [addToast])

  return { toasts, addToast, removeToast, success, error, warning, info }
}
