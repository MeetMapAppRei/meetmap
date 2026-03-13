import { useState } from 'react'
import { signIn, signUp } from '../lib/supabase'

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
    marginBottom: 12,
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
}

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handle = async () => {
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password)
        if (error) throw error
        onClose()
      } else {
        if (!username.trim()) throw new Error('Username is required')
        const { error } = await signUp(email, password, username)
        if (error) throw error
        setSuccess('Check your email to confirm your account, then log in!')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={S.sheet}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, color: '#FF6B35' }}>
            {mode === 'login' ? 'WELCOME BACK' : 'JOIN THE SCENE'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 26, cursor: 'pointer' }}>×</button>
        </div>

        {error && <div style={S.error}>{error}</div>}
        {success && (
          <div style={{ ...S.error, borderColor: '#35FF6B', color: '#60FF90', background: '#0A1A0A' }}>
            {success}
          </div>
        )}

        {mode === 'signup' && (
          <input
            style={S.input} placeholder="Username (shown publicly)"
            value={username} onChange={e => setUsername(e.target.value)}
          />
        )}
        <input
          style={S.input} type="email" placeholder="Email"
          value={email} onChange={e => setEmail(e.target.value)}
        />
        <input
          style={S.input} type="password" placeholder="Password"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handle()}
        />

        <button style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} onClick={handle} disabled={loading}>
          {loading ? 'LOADING...' : mode === 'login' ? 'LET ME IN' : 'CREATE ACCOUNT'}
        </button>

        <div style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#555',
          textAlign: 'center', marginTop: 20,
        }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess('') }}
            style={{ color: '#FF6B35', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </span>
        </div>
      </div>
    </div>
  )
}
