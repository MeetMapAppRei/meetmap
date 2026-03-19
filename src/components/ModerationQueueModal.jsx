import { useMemo } from 'react'
import { useTheme } from '../lib/ThemeContext'

export default function ModerationQueueModal({
  reports,
  loading,
  onClose,
  onResolve,
  onIgnore,
  resolvingReportId,
}) {
  const { isLight } = useTheme()

  const overlayBg = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.92)'
  const panelBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const panelBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const textMuted = isLight ? '#666' : '#888'
  const btnBorder = isLight ? '#E5E5E5' : '#222'
  const btnBg = isLight ? '#F2F2F2' : '#141414'

  const pendingCount = useMemo(() => (reports || []).length, [reports])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: overlayBg,
        zIndex: 1550,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 14,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: panelBg,
          borderRadius: 16,
          border: `1px solid ${panelBorder}`,
          overflow: 'hidden',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${btnBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1.8, color: '#FF6B35' }}>
              MODERATION QUEUE
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted }}>
              {loading ? 'Loading…' : `${pendingCount} pending report${pendingCount === 1 ? '' : 's'}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: isLight ? '#666' : '#fff', fontSize: 26, cursor: 'pointer', padding: 6 }}>
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!loading && (!reports || reports.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '36px 10px', color: textMuted, fontFamily: "'DM Sans', sans-serif" }}>
              No pending reports.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(reports || []).map((r) => {
                const eventTitle = r?.events?.title || '(missing event title)'
                const reporter = r?.profiles?.username || 'Anonymous'
                const reason = r?.reason || 'Reported'
                const details = r?.details || ''
                const createdAt = r?.created_at ? new Date(r.created_at).toLocaleString() : ''

                return (
                  <div key={r.id} style={{ border: `1px solid ${btnBorder}`, borderRadius: 12, background: btnBg, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 10, overflow: 'hidden', background: btnBorder, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textMuted }}>
                        {r?.events?.photo_url ? (
                          <img src={r.events.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          '🚩'
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 900, color: isLight ? '#111' : '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {eventTitle}
                        </div>
                        <div style={{ marginTop: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted }}>
                          Reporter: <span style={{ color: isLight ? '#444' : '#ddd', fontWeight: 700 }}>{reporter}</span>
                        </div>
                        <div style={{ marginTop: 4, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: textMuted }}>
                          {createdAt}
                        </div>
                        <div style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#FF8A5C', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {reason}
                        </div>
                      </div>
                    </div>

                    {details ? (
                      <div style={{ marginTop: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: isLight ? '#555' : '#ddd', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        {details}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        disabled={resolvingReportId === r.id}
                        onClick={() => onResolve?.(r.id, 'resolved')}
                        style={{
                          background: resolvingReportId === r.id ? '#333' : '#7CFF6B',
                          border: 'none',
                          color: '#0A0A0A',
                          borderRadius: 10,
                          padding: '10px 14px',
                          cursor: resolvingReportId === r.id ? 'default' : 'pointer',
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 16,
                          letterSpacing: 1,
                        }}
                      >
                        RESOLVE
                      </button>
                      <button
                        disabled={resolvingReportId === r.id}
                        onClick={() => onIgnore?.(r.id, 'ignored')}
                        style={{
                          background: resolvingReportId === r.id ? '#222' : 'transparent',
                          border: `1px solid ${btnBorder}`,
                          color: textMuted,
                          borderRadius: 10,
                          padding: '10px 14px',
                          cursor: resolvingReportId === r.id ? 'default' : 'pointer',
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 16,
                          letterSpacing: 1,
                        }}
                      >
                        IGNORE
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

