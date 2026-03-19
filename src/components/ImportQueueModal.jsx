import { useMemo } from 'react'
import { useTheme } from '../lib/ThemeContext'

const TYPE_LABELS = {
  meet: 'Meet',
  'car show': 'Car Show',
  'track day': 'Track Day',
  cruise: 'Cruise',
}

function requiredOk(i) {
  const requiredKeys = ['title', 'type', 'date', 'location', 'city']
  return requiredKeys.every(k => typeof i?.[k] === 'string' ? i[k].trim().length > 0 : !!i?.[k])
}

export default function ImportQueueModal({
  imports,
  loading,
  approvingId,
  onApprove,
  onReject,
  onClose,
}) {
  const { isLight } = useTheme()

  const overlayBg = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.92)'
  const panelBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const panelBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const textMuted = isLight ? '#666' : '#888'
  const btnBorder = isLight ? '#E5E5E5' : '#222'
  const btnBg = isLight ? '#F2F2F2' : '#141414'
  const closeColor = isLight ? '#666' : '#fff'

  const pendingCount = useMemo(() => (imports || []).length, [imports])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: overlayBg,
        zIndex: 1400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
      }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 760,
          maxHeight: '90vh',
          overflow: 'hidden',
          background: panelBg,
          border: `1px solid ${panelBorder}`,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${btnBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 1.8, color: '#FF6B35' }}>
              IMPORT QUEUE
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted }}>
              {loading ? 'Loading...' : `${pendingCount} pending import${pendingCount === 1 ? '' : 's'}`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: closeColor,
              fontSize: 26,
              cursor: 'pointer',
              padding: 6,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!imports || imports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 10px', color: textMuted, fontFamily: "'DM Sans', sans-serif" }}>
              No pending imports.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {imports.map(i => {
                const ready = requiredOk(i)
                return (
                  <div
                    key={i.id}
                    style={{
                      border: `1px solid ${btnBorder}`,
                      borderRadius: 12,
                      background: btnBg,
                      overflow: 'hidden',
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ width: 96, flexShrink: 0 }}>
                      {i.image_url ? (
                        <img src={i.image_url} alt="flyer" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10 }} />
                      ) : (
                        <div style={{ width: 96, height: 96, borderRadius: 10, background: btnBorder, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🖼️</div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 800, color: isLight ? '#111' : '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {i.title || '(missing title)'}
                          </div>
                          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted, marginTop: 4 }}>
                            {TYPE_LABELS[i.type] || i.type || 'Missing type'} · {i.date || 'Missing date'}
                          </div>
                          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            📍 {i.address || `${i.location || ''} · ${i.city || ''}` || 'Missing location/city'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: textMuted }}>
                            Source
                          </div>
                          <a href={i.source_url} target="_blank" rel="noreferrer" style={{ color: '#FF6B35', fontFamily: "'DM Sans', sans-serif", fontSize: 12, textDecoration: 'underline' }}>
                            Open
                          </a>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted, lineHeight: 1.45 }}>
                        {i.description ? i.description.slice(0, 180) + (i.description.length > 180 ? '…' : '') : 'No description found.'}
                      </div>

                      <div style={{ marginTop: 10, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => onReject?.(i)}
                          style={{ background: 'transparent', border: `1px solid ${btnBorder}`, color: textMuted, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', fontFamily: "'Bebas Neue', sans-serif", fontSize: 16 }}
                          disabled={approvingId === i.id}
                        >
                          REJECT
                        </button>
                        <button
                          onClick={() => onApprove?.(i)}
                          style={{
                            background: ready ? '#FF6B35' : isLight ? '#EDEDED' : '#222',
                            border: 'none',
                            color: ready ? '#0A0A0A' : isLight ? '#666' : '#888',
                            borderRadius: 10,
                            padding: '10px 16px',
                            cursor: ready ? 'pointer' : 'not-allowed',
                            fontFamily: "'Bebas Neue', sans-serif",
                            fontSize: 16,
                            letterSpacing: 1,
                            opacity: approvingId === i.id ? 0.85 : 1,
                          }}
                          disabled={!ready || approvingId === i.id}
                        >
                          {approvingId === i.id ? 'APPROVING…' : 'APPROVE'}
                        </button>
                      </div>

                      {!ready && (
                        <div style={{ marginTop: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: isLight ? '#A33' : '#FF6060' }}>
                          Approve is blocked until `title`, `type`, `date`, `location`, and `city` are present.
                        </div>
                      )}
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

