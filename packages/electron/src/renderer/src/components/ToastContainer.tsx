import React from 'react'
import type { Toast, ToastLevel } from '../hooks/useToast'

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

const ICONS: Record<ToastLevel, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast--${toast.level}`}
          role="alert"
        >
          <span className="toast__icon">{ICONS[toast.level]}</span>
          <span className="toast__message">{toast.message}</span>
          <button
            className="toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
