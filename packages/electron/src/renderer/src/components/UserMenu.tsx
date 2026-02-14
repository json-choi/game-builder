import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

export const UserMenu: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, signInEmail, logout } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signInError, setSignInError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setShowLoginForm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setSignInError(null)
    setIsSigningIn(true)
    try {
      await signInEmail(email, password)
      setShowLoginForm(false)
      setEmail('')
      setPassword('')
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign in failed')
    } finally {
      setIsSigningIn(false)
    }
  }

  if (isLoading) return null

  if (!isAuthenticated) {
    if (showLoginForm) {
      return (
        <div className="user-menu__login-form" ref={menuRef}>
          <form onSubmit={handleEmailSignIn}>
            <input
              type="text"
              className="user-menu__login-input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <input
              type="password"
              className="user-menu__login-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {signInError && <div className="user-menu__login-error">{signInError}</div>}
            <div className="user-menu__login-actions">
              <button type="submit" className="user-menu__login-submit" disabled={isSigningIn}>
                {isSigningIn ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                type="button"
                className="user-menu__login-cancel"
                onClick={() => setShowLoginForm(false)}
              >
                Cancel
              </button>
            </div>
          </form>
          <div className="user-menu__login-divider">
            <span>or</span>
          </div>
          <button className="user-menu__sign-in-btn" onClick={login}>
            Sign In with OAuth
          </button>
        </div>
      )
    }

    return (
      <div className="user-menu__sign-in-group">
        <button className="user-menu__sign-in-btn" onClick={() => setShowLoginForm(true)}>
          Sign In
        </button>
      </div>
    )
  }

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  return (
    <div className="user-menu" ref={menuRef}>
      <button className="user-menu__trigger" onClick={() => setIsOpen(!isOpen)}>
        {user?.image ? (
          <img className="user-menu__avatar" src={user.image} alt={user.name} />
        ) : (
          <span className="user-menu__initials">{initials}</span>
        )}
        <span className="user-menu__name">{user?.name || 'User'}</span>
      </button>

      {isOpen && (
        <div className="user-menu__dropdown">
          <div className="user-menu__dropdown-email">{user?.email}</div>
          <button
            className="user-menu__dropdown-item"
            onClick={() => {
              logout()
              setIsOpen(false)
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  )
}
