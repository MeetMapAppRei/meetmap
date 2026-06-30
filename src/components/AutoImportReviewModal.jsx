import { useMemo } from 'react'
import { useTheme } from '../lib/useTheme'

const STATUS_LABELS = {
  posted: 'Posted',
  skipped: 'Skipped',
  failed: 'Failed',
  dry_run: 'Dry Run',
  pending: 'Pending',
}

const STATUS_COLORS = {
  posted: '#7CFF6B',
  skipped: '#FFD700',
  failed: '#FF6060',
  dry_run: '#00D4FF',
  pending: '#888888',
}

function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return String(value)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function reasonLabel(candidate) {
  const raw = candidate?.skip_reason || candidate?.error_message || ''
  if (!raw) return ''
  return String(raw).replace(/_/g, ' ').replace(/,/g, ', ')
}

export default function AutoImportReviewModal({
  runs,
  candidates,
  loading,
  errorMessage,
  onClose,
}) {
  const { isLight } = useTheme()

  const stats = useMemo(() => {
    const rows = candidates || []
    return {
      posted: rows.filter((c) => c.status === 'posted').length,
      skipped: rows.filter((c) => c.status === 'skipped').length,
      failed: rows.filter((c) => c.status === 'failed').length,
      dryRun: rows.filter((c) => c.status === 'dry_run').length,
    }
  }, [candidates])

  const overlayBg = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.92)'
  const panelBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const panelBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const text = isLight ? '#111111' : '#F0F0F0'
  const textMuted = isLight ? '#666' : '#888'
  const cardBg = isLight ? '#F7F7F7' : '#141414'
  const cardBorder = isLight ? '#E5E5E5' : '#222'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: overlayBg,
        zIndex: 1600,
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
          maxWidth: 860,
          maxHeight: '90vh',
          overflow: 'hidden',
          background: panelBg,
          border: `1px solid ${panelBorder}`,
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${cardBorder}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
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
              DAILY AUTO IMPORTS
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: textMuted }}>
              {loading
                ? 'Loading...'
                : `${runs?.length || 0} run${runs?.length === 1 ? '' : 's'} today`}
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
            x
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {[
              ['Posted', stats.posted, STATUS_COLORS.posted],
              ['Skipped', stats.skipped, STATUS_COLORS.skipped],
              ['Failed', stats.failed, STATUS_COLORS.failed],
              ['Dry Run', stats.dryRun, STATUS_COLORS.dry_run],
            ].map(([label, count, color]) => (
              <div
                key={label}
                style={{
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 12,
                  background: cardBg,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    color,
                    fontSize: 22,
                    letterSpacing: 1,
                  }}
                >
                  {count}
                </div>
                <div
                  style={{ fontFamily: "'DM Sans', sans-serif", color: textMuted, fontSize: 12 }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {errorMessage && (
            <div
              style={{
                marginTop: 12,
                border: `1px solid ${STATUS_COLORS.failed}`,
                borderRadius: 12,
                color: STATUS_COLORS.failed,
                padding: 12,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
              }}
            >
              {errorMessage}
            </div>
          )}

          {loading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '34px 10px',
                color: textMuted,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Loading import review...
            </div>
          ) : !candidates?.length ? (
            <div
              style={{
                textAlign: 'center',
                padding: '34px 10px',
                color: textMuted,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              No auto-import candidates logged today.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {candidates.map((candidate) => {
                const color = STATUS_COLORS[candidate.status] || STATUS_COLORS.pending
                const event = candidate.events
                return (
                  <div
                    key={candidate.id}
                    style={{
                      border: `1px solid ${cardBorder}`,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 12,
                      background: cardBg,
                      overflow: 'hidden',
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                    }}
                  >
                    <div style={{ width: 96, flexShrink: 0 }}>
                      {(candidate.stored_image_url || candidate.image_url) && (
                        <img
                          src={candidate.stored_image_url || candidate.image_url}
                          alt={candidate.title || 'flyer'}
                          style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10 }}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: "'DM Sans', sans-serif",
                              color: text,
                              fontSize: 14,
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {candidate.title || '(missing title)'}
                          </div>
                          <div
                            style={{
                              fontFamily: "'DM Sans', sans-serif",
                              color: textMuted,
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            {candidate.date || 'No date'} · {candidate.city || 'No city'} ·
                            confidence {candidate.confidence || 0}
                          </div>
                          <div
                            style={{
                              fontFamily: "'DM Sans', sans-serif",
                              color: textMuted,
                              fontSize: 12,
                              marginTop: 4,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {candidate.address || candidate.location || 'No address'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div
                            style={{
                              display: 'inline-block',
                              borderRadius: 20,
                              padding: '3px 9px',
                              background: `${color}22`,
                              color,
                              fontFamily: "'DM Sans', sans-serif",
                              fontSize: 11,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            {STATUS_LABELS[candidate.status] || candidate.status}
                          </div>
                        </div>
                      </div>

                      {reasonLabel(candidate) && (
                        <div
                          style={{
                            marginTop: 8,
                            fontFamily: "'DM Sans', sans-serif",
                            color: textMuted,
                            fontSize: 12,
                          }}
                        >
                          Reason: {reasonLabel(candidate)}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 10,
                          display: 'flex',
                          gap: 12,
                          flexWrap: 'wrap',
                          fontFamily: "'DM Sans', sans-serif",
                          fontSize: 12,
                        }}
                      >
                        {candidate.source_url && (
                          <a
                            href={candidate.source_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#FF6B35' }}
                          >
                            Source
                          </a>
                        )}
                        {event?.id && (
                          <a
                            href={`/?event=${encodeURIComponent(event.id)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#FF6B35' }}
                          >
                            Event
                          </a>
                        )}
                        <span style={{ color: textMuted }}>
                          {formatDateTime(candidate.created_at)}
                        </span>
                      </div>
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
