import { useState } from 'react'
import { signIn, signUp, supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
    zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  },
  sheet: {
    width: '100%', maxWidth: 480, background: '#0F0F0F',
    borderRadius: '20px 20px 0 0', border: '1px solid #1A1A1A',
    padding: '28px 24px 48px', animation: 'slideUp 0.3s ease',
  },
  input: {
    width: '100%', background: '#141414', border: '1px solid #222',
    borderRadius: 10, padding: '12px 14px', color: '#F0F0F0',
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
    marginBottom: 12, colorScheme: 'dark',
  },
  btn: {
    width: '100%', background: '#FF6B35', color: '#0A0A0A',
    border: 'none', borderRadius: 10, padding: 14,
    fontFamily: "'Bebas Neue', sans-serif", fontSize: 20,
    letterSpacing: 2, cursor: 'pointer', marginTop: 8,
  },
  error: {
    background: '#1A0A0A', border: '1px solid #FF3535',
    borderRadius: 8, padding: '10px 14px', marginBottom: 12,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#FF6060',
  },
  success: {
    background: '#0A1A0A', border: '1px solid #35FF6B',
    borderRadius: 8, padding: '10px 14px', marginBottom: 12,
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#60FF90',
  },
}

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login') // login | signup | reset
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { isLight } = useTheme()

  const overlayStyle = { ...S.overlay, background: isLight ? 'rgba(0,0,0,0.28)' : S.overlay.background }
  const sheetStyle = {
    ...S.sheet,
    background: isLight ? '#FFFFFF' : S.sheet.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
  }
  const inputStyle = {
    ...S.input,
    background: isLight ? '#FFFFFF' : S.input.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#222'}`,
    color: isLight ? '#111111' : S.input.color,
    colorScheme: isLight ? 'light' : 'dark',
  }
  const errorStyle = {
    ...S.error,
    background: isLight ? '#FFF1F1' : S.error.background,
    border: `1px solid ${isLight ? '#FF6B6B' : '#FF3535'}`,
    color: isLight ? '#B00020' : S.error.color,
  }
  const successStyle = {
    ...S.success,
    background: isLight ? '#ECFFF2' : S.success.background,
    border: `1px solid ${isLight ? '#35FF6B' : '#35FF6B'}`,
    color: isLight ? '#0A7A22' : S.success.color,
  }
  const closeColor = isLight ? '#666' : '#555'
  const helperText = isLight ? '#666' : '#555'
  const forgotLinkColor = isLight ? '#FF6B35' : '#FF6B35'

  const handle = async () => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) throw error
        onClose()
      } else if (mode === 'signup') {
        if (!username.trim()) throw new Error('Username is required')
        if (password.length < 6) throw new Error('Password must be at least 6 characters')
        const { error } = await signUp(email, password, username)
        if (error) throw error
        setSuccess('Account created! You can now log in.')
        setTimeout(() => { setMode('login'); setSuccess('') }, 2000)
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://meetmap-gilt.vercel.app',
        })
        if (error) throw error
        setSuccess('Password reset email sent! Check your inbox.')
      }
    } catch (e) {
      const msg = e.message || 'Something went wrong'
      if (msg.includes('Invalid login')) setError('Incorrect email or password.')
      else if (msg.includes('already registered')) setError('An account with this email already exists.')
      else if (msg.includes('rate limit')) setError('Too many attempts. Please wait a few minutes and try again.')
      else setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (newMode) => {
    setMode(newMode)
    setError('')
    setSuccess('')
  }

  const titles = { login: 'WELCOME BACK', signup: 'JOIN THE SCENE', reset: 'RESET PASSWORD' }
  const btnLabels = { login: 'LET ME IN', signup: 'CREATE ACCOUNT', reset: 'SEND RESET EMAIL' }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={sheetStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, color: '#FF6B35' }}>
            {titles[mode]}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: closeColor, fontSize: 26, cursor: 'pointer' }}>×</button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}
        {success && <div style={successStyle}>{success}</div>}

        {mode === 'signup' && (
          <input style={inputStyle} placeholder="Username (shown publicly)" value={username} onChange={e => setUsername(e.target.value)} />
        )}

        <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />

        {mode !== 'reset' && (
          <input
            style={inputStyle} type="password"
            placeholder={mode === 'signup' ? 'Password (min 6 characters)' : 'Password'}
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handle()}
          />
        )}

        {mode === 'login' && (
          <div style={{ textAlign: 'right', marginTop: -6, marginBottom: 8 }}>
            <span onClick={() => switchMode('reset')} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: helperText, cursor: 'pointer', textDecoration: 'underline' }}>
              Forgot password?
            </span>
          </div>
        )}

        <button style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} onClick={handle} disabled={loading}>
          {loading ? 'LOADING...' : btnLabels[mode]}
        </button>

        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: helperText, textAlign: 'center', marginTop: 20 }}>
          {mode === 'login' && <>
            Don't have an account?{' '}
            <span onClick={() => switchMode('signup')} style={{ color: forgotLinkColor, cursor: 'pointer', textDecoration: 'underline' }}>Sign up free</span>
          </>}
          {mode === 'signup' && <>
            Already have an account?{' '}
            <span onClick={() => switchMode('login')} style={{ color: forgotLinkColor, cursor: 'pointer', textDecoration: 'underline' }}>Log in</span>
          </>}
          {mode === 'reset' && <>
            <span onClick={() => switchMode('login')} style={{ color: forgotLinkColor, cursor: 'pointer', textDecoration: 'underline' }}>← Back to login</span>
          </>}
        </div>
      </div>
    </div>
  )
}
