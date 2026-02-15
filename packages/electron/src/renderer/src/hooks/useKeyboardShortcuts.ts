import { useEffect, useCallback } from 'react'

export type ShortcutAction =
  | 'send-message'
  | 'new-project'
  | 'tab-1'
  | 'tab-2'
  | 'tab-3'
  | 'tab-4'
  | 'tab-5'

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  'send-message': 'Cmd+Enter',
  'new-project': 'Cmd+N',
  'tab-1': 'Cmd+1',
  'tab-2': 'Cmd+2',
  'tab-3': 'Cmd+3',
  'tab-4': 'Cmd+4',
  'tab-5': 'Cmd+5',
}

type ShortcutHandler = (action: ShortcutAction) => void

export function useKeyboardShortcuts(handler: ShortcutHandler) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'Enter') {
        e.preventDefault()
        handler('send-message')
        return
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        handler('new-project')
        return
      }

      const tabKeys = ['1', '2', '3', '4', '5']
      const idx = tabKeys.indexOf(e.key)
      if (idx >= 0) {
        e.preventDefault()
        handler(`tab-${idx + 1}` as ShortcutAction)
        return
      }
    },
    [handler]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
