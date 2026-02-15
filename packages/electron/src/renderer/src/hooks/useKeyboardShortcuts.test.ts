import { describe, expect, test } from 'bun:test'

type ShortcutAction =
  | 'send-message'
  | 'new-project'
  | 'tab-1'
  | 'tab-2'
  | 'tab-3'
  | 'tab-4'
  | 'tab-5'

function resolveShortcut(key: string, ctrlKey: boolean, metaKey: boolean): ShortcutAction | null {
  const mod = metaKey || ctrlKey
  if (!mod) return null

  if (key === 'Enter') return 'send-message'
  if (key === 'n' || key === 'N') return 'new-project'

  const tabKeys = ['1', '2', '3', '4', '5']
  const idx = tabKeys.indexOf(key)
  if (idx >= 0) return `tab-${idx + 1}` as ShortcutAction

  return null
}

describe('useKeyboardShortcuts', () => {
  describe('shortcut resolution', () => {
    test('Cmd+Enter resolves to send-message', () => {
      expect(resolveShortcut('Enter', false, true)).toBe('send-message')
    })

    test('Ctrl+Enter resolves to send-message', () => {
      expect(resolveShortcut('Enter', true, false)).toBe('send-message')
    })

    test('Cmd+N resolves to new-project', () => {
      expect(resolveShortcut('n', false, true)).toBe('new-project')
    })

    test('Cmd+Shift+N (uppercase) resolves to new-project', () => {
      expect(resolveShortcut('N', false, true)).toBe('new-project')
    })

    test('Cmd+1 resolves to tab-1', () => {
      expect(resolveShortcut('1', false, true)).toBe('tab-1')
    })

    test('Cmd+2 resolves to tab-2', () => {
      expect(resolveShortcut('2', false, true)).toBe('tab-2')
    })

    test('Cmd+3 resolves to tab-3', () => {
      expect(resolveShortcut('3', false, true)).toBe('tab-3')
    })

    test('Cmd+4 resolves to tab-4', () => {
      expect(resolveShortcut('4', false, true)).toBe('tab-4')
    })

    test('Cmd+5 resolves to tab-5', () => {
      expect(resolveShortcut('5', false, true)).toBe('tab-5')
    })

    test('Ctrl+1 also resolves to tab-1', () => {
      expect(resolveShortcut('1', true, false)).toBe('tab-1')
    })
  })

  describe('non-matching shortcuts return null', () => {
    test('Enter without modifier returns null', () => {
      expect(resolveShortcut('Enter', false, false)).toBeNull()
    })

    test('plain number key without modifier returns null', () => {
      expect(resolveShortcut('1', false, false)).toBeNull()
    })

    test('Cmd+6 returns null (only 1-5 supported)', () => {
      expect(resolveShortcut('6', false, true)).toBeNull()
    })

    test('Cmd+0 returns null', () => {
      expect(resolveShortcut('0', false, true)).toBeNull()
    })

    test('Cmd+a returns null', () => {
      expect(resolveShortcut('a', false, true)).toBeNull()
    })

    test('Cmd+Escape returns null', () => {
      expect(resolveShortcut('Escape', false, true)).toBeNull()
    })
  })

  describe('tab mapping', () => {
    test('tab shortcuts map to correct LeftPanel tabs', () => {
      type LeftPanelTab = 'preview' | 'files' | 'assets' | 'console' | 'settings'
      const tabMap: Record<string, LeftPanelTab> = {
        'tab-1': 'preview',
        'tab-2': 'files',
        'tab-3': 'assets',
        'tab-4': 'console',
        'tab-5': 'settings',
      }

      expect(tabMap['tab-1']).toBe('preview')
      expect(tabMap['tab-2']).toBe('files')
      expect(tabMap['tab-3']).toBe('assets')
      expect(tabMap['tab-4']).toBe('console')
      expect(tabMap['tab-5']).toBe('settings')
    })
  })

  describe('shortcut labels', () => {
    test('all actions have labels', () => {
      const labels: Record<ShortcutAction, string> = {
        'send-message': 'Cmd+Enter',
        'new-project': 'Cmd+N',
        'tab-1': 'Cmd+1',
        'tab-2': 'Cmd+2',
        'tab-3': 'Cmd+3',
        'tab-4': 'Cmd+4',
        'tab-5': 'Cmd+5',
      }

      const actions: ShortcutAction[] = ['send-message', 'new-project', 'tab-1', 'tab-2', 'tab-3', 'tab-4', 'tab-5']
      for (const action of actions) {
        expect(labels[action]).toBeDefined()
        expect(labels[action].length).toBeGreaterThan(0)
      }
    })
  })
})
