import { useState } from 'react'
import { useTheme } from '../lib/ThemeContext'
import { createEventReport } from '../lib/supabase'

const REASONS = [
  { value: 'spam_or_scam', label: 'Spam / Scam' },
  { value: 'wrong_info', label: 'Wrong / Misleading Info' },
  { value: 'offensive', label: 'Offensive / Inappropriate' },
  { value: 'duplicate', label: 'Duplicate Event' },
  { value: 'other', label: 'Other' },
]

export default function ReportEventModal({ event, user, onAuthNeeded, onClose, onReported }) {
  const { isLight } = useTheme()

  const [reason, setReason] = useState(REASONS[0]?.value || 'spam_or_scam')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const overlayBg = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.92)'
  const panelBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const panelBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const textMuted = isLight ? '#666' : '#888'
  const inputBg = isLight ? '#FFFFFF' : '#141414'
  const inputBorder = isLight ? '#E5E5E5' : '#222'
  const inputText = isLight ? '#111111' : '#F0F0F0'

  const handleSubmit = async () => {
    setError('')
    if (!event?.id) {
      setError('Missing event.')
      return
    }

    if (!user) {
      onAuthNeeded?.()
      return
    }

    setSubmitting(true)
    try {
      await createEventReport(event.id, user.id, reason, details)
      setSuccess(true)
      onReported?.()
      setTimeout(() => onClose?.(), 800)
    } catch (e) {
      setError(e?.message || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  if (!event) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: overlayBg,
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: panelBg,
          border: `1px solid ${panelBorder}`,
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${inputBorder}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 22,
                letterSpacing: 1.8,
                color: '#FF6B35',
              }}
            >
              REPORT EVENT
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted }}>
              {success ? 'Thanks for helping keep MeetMap clean.' : 'Tell us what’s wrong.'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: isLight ? '#666' : '#fff',
              fontSize: 26,
              cursor: 'pointer',
              padding: 6,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {error && (
            <div
              style={{
                marginBottom: 12,
                border: `1px solid ${isLight ? '#FF6B6B' : '#FF3535'}`,
                background: isLight ? '#FFF1F1' : '#1A0A0A',
                color: isLight ? '#B00020' : '#FF6060',
                borderRadius: 10,
                padding: '10px 12px',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                lineHeight: 1.4,
              }}
            >
              {String(error)}
            </div>
          )}

          <div
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 900,
              color: textMuted,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Reason
          </div>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={success || submitting}
            style={{
              width: '100%',
              background: inputBg,
              border: `1px solid ${inputBorder}`,
              borderRadius: 10,
              padding: '10px 12px',
              color: inputText,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              outline: 'none',
            }}
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          <div
            style={{
              marginTop: 12,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              fontWeight: 900,
              color: textMuted,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}
          >
            Details (optional)
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            disabled={success || submitting}
            rows={4}
            placeholder="Add any helpful context (e.g. why it seems invalid)…"
            style={{
              width: '100%',
              background: inputBg,
              border: `1px solid ${inputBorder}`,
              borderRadius: 10,
              padding: '10px 12px',
              color: inputText,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              outline: 'none',
              resize: 'none',
            }}
          />

          <div
            style={{
              marginTop: 14,
              display: 'flex',
              gap: 10,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={onClose}
              disabled={submitting}
              style={{
                background: 'transparent',
                border: `1px solid ${inputBorder}`,
                color: textMuted,
                borderRadius: 10,
                padding: '10px 14px',
                cursor: submitting ? 'default' : 'pointer',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16,
              }}
            >
              CANCEL
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || success}
              style={{
                background: '#FF6B35',
                border: 'none',
                color: '#0A0A0A',
                borderRadius: 10,
                padding: '10px 16px',
                cursor: submitting || success ? 'default' : 'pointer',
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 16,
                letterSpacing: 1,
              }}
            >
              {submitting ? 'SUBMITTING…' : success ? 'RECEIVED' : 'SUBMIT'}
            </button>
          </div>

          {!user && (
            <div
              style={{
                marginTop: 10,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 12,
                color: textMuted,
              }}
            >
              Log in to submit a report.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
