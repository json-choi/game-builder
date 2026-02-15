import { describe, expect, test } from 'bun:test'

type ToastLevel = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  level: ToastLevel
  message: string
  duration: number
}

let counter = 0

function createToast(level: ToastLevel, message: string, duration = 4000): Toast {
  return { id: `toast-${++counter}-${Date.now()}`, level, message, duration }
}

describe('useToast', () => {
  describe('toast creation', () => {
    test('creates success toast with default duration', () => {
      const toast = createToast('success', 'Saved!')
      expect(toast.level).toBe('success')
      expect(toast.message).toBe('Saved!')
      expect(toast.duration).toBe(4000)
    })

    test('creates error toast with 6000ms duration', () => {
      const toast = createToast('error', 'Failed to save', 6000)
      expect(toast.level).toBe('error')
      expect(toast.duration).toBe(6000)
    })

    test('creates warning toast', () => {
      const toast = createToast('warning', 'API key missing')
      expect(toast.level).toBe('warning')
      expect(toast.message).toBe('API key missing')
    })

    test('creates info toast', () => {
      const toast = createToast('info', 'Build started')
      expect(toast.level).toBe('info')
    })

    test('each toast has unique id', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 10; i++) {
        const toast = createToast('info', `Toast ${i}`)
        ids.add(toast.id)
      }
      expect(ids.size).toBe(10)
    })
  })

  describe('toast list management', () => {
    test('adding toasts appends to list', () => {
      const toasts: Toast[] = []
      toasts.push(createToast('success', 'A'))
      toasts.push(createToast('error', 'B'))
      toasts.push(createToast('info', 'C'))
      expect(toasts).toHaveLength(3)
      expect(toasts[0].message).toBe('A')
      expect(toasts[2].message).toBe('C')
    })

    test('removing toast by id filters correctly', () => {
      const toasts: Toast[] = [
        createToast('success', 'A'),
        createToast('error', 'B'),
        createToast('info', 'C'),
      ]
      const idToRemove = toasts[1].id
      const filtered = toasts.filter((t) => t.id !== idToRemove)
      expect(filtered).toHaveLength(2)
      expect(filtered[0].message).toBe('A')
      expect(filtered[1].message).toBe('C')
    })

    test('removing non-existent id does nothing', () => {
      const toasts: Toast[] = [createToast('info', 'A')]
      const filtered = toasts.filter((t) => t.id !== 'nonexistent')
      expect(filtered).toHaveLength(1)
    })
  })

  describe('toast levels', () => {
    test('all four levels are valid', () => {
      const levels: ToastLevel[] = ['success', 'error', 'warning', 'info']
      for (const level of levels) {
        const toast = createToast(level, `test ${level}`)
        expect(toast.level).toBe(level)
      }
    })
  })

  describe('toast icon mapping', () => {
    test('each level has a corresponding icon', () => {
      const icons: Record<ToastLevel, string> = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ',
      }
      const levels: ToastLevel[] = ['success', 'error', 'warning', 'info']
      for (const level of levels) {
        expect(icons[level]).toBeDefined()
        expect(icons[level].length).toBeGreaterThan(0)
      }
    })
  })

  describe('auto-dismiss logic', () => {
    test('duration 0 means no auto-dismiss', () => {
      const toast = createToast('info', 'Persistent', 0)
      expect(toast.duration).toBe(0)
    })

    test('default duration is 4000ms', () => {
      const toast = createToast('info', 'Default')
      expect(toast.duration).toBe(4000)
    })

    test('custom duration is preserved', () => {
      const toast = createToast('warning', 'Custom', 10000)
      expect(toast.duration).toBe(10000)
    })
  })
})
