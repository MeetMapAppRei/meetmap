import { useTheme } from '../lib/useTheme'

function ToggleRow({ label, description, checked, disabled, onChange, isLight }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 14,
        padding: '14px 0',
        borderBottom: `1px solid ${isLight ? '#ECECEC' : '#1E1E1E'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            color: isLight ? '#222' : '#F0F0F0',
          }}
        >
          {label}
        </span>
        {description ? (
          <span
            style={{
              display: 'block',
              marginTop: 4,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              lineHeight: 1.45,
              color: isLight ? '#666' : '#888',
            }}
          >
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 18,
          height: 18,
          marginTop: 2,
          accentColor: '#FF6B35',
          flexShrink: 0,
        }}
      />
    </label>
  )
}

export default function NotificationSettingsModal({
  onClose,
  alertsEnabled,
  prefs,
  saving = false,
  canSyncPrefs = false,
  onPrefChange,
  onRequestEnable,
  onRequestLogin,
}) {
  const { isLight } = useTheme()
  const sheetBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const sheetBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const muted = isLight ? '#666' : '#888'

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.9)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-settings-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          background: sheetBg,
          borderRadius: '20px 20px 0 0',
          border: `1px solid ${sheetBorder}`,
          borderBottom: 'none',
          padding: '24px 22px 40px',
          maxHeight: 'min(88vh, 720px)',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <h2
            id="notification-settings-title"
            style={{
              margin: 0,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28,
              letterSpacing: 1.5,
              color: isLight ? '#111' : '#F5F5F5',
            }}
          >
            ALERT SETTINGS
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: muted,
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p
          style={{
            margin: '0 0 16px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            lineHeight: 1.5,
            color: muted,
          }}
        >
          {alertsEnabled
            ? 'Choose what you get for saved events. Settings sync to your account.'
            : 'Turn on alerts on this device first, then choose what you want to receive.'}
        </p>

        {!alertsEnabled ? (
          <button
            type="button"
            onClick={onRequestEnable}
            style={{
              width: '100%',
              background: '#FF6B35',
              color: '#0A0A0A',
              border: 'none',
              borderRadius: 10,
              padding: 14,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 20,
              letterSpacing: 2,
              cursor: 'pointer',
              marginBottom: 16,
            }}
          >
            ENABLE ALERTS
          </button>
        ) : null}

        {!canSyncPrefs ? (
          <p
            style={{
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: 8,
              background: isLight ? '#FFF4EE' : '#1A120E',
              border: `1px solid ${isLight ? '#FFD4C0' : '#3A2218'}`,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: isLight ? '#8A3D1A' : '#FFAB7A',
            }}
          >
            Log in to save these settings.{' '}
            <button
              type="button"
              onClick={onRequestLogin}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: '#FF6B35',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Log in
            </button>
          </p>
        ) : null}

        <div style={{ opacity: !alertsEnabled || saving ? 0.7 : 1 }}>
          <ToggleRow
            label="Event reminders"
            description="Before saved meets start."
            checked={prefs.reminders_enabled}
            disabled={!alertsEnabled || saving || !canSyncPrefs}
            onChange={(enabled) => onPrefChange({ reminders_enabled: enabled })}
            isLight={isLight}
          />
          <div style={{ paddingLeft: 12 }}>
            <ToggleRow
              label="24 hours before"
              description="One alert in the hour before the 24-hour mark."
              checked={prefs.reminder_24h_enabled}
              disabled={!alertsEnabled || !prefs.reminders_enabled || saving || !canSyncPrefs}
              onChange={(enabled) =>
                onPrefChange({ reminders_enabled: true, reminder_24h_enabled: enabled })
              }
              isLight={isLight}
            />
            <ToggleRow
              label="2 hours before"
              description="One alert in the ~20 minutes before the 2-hour mark."
              checked={prefs.reminder_2h_enabled}
              disabled={!alertsEnabled || !prefs.reminders_enabled || saving || !canSyncPrefs}
              onChange={(enabled) =>
                onPrefChange({ reminders_enabled: true, reminder_2h_enabled: enabled })
              }
              isLight={isLight}
            />
          </div>
          <ToggleRow
            label="Host updates & status"
            description="Host posts an update or changes status (canceled, moved, delayed)."
            checked={prefs.event_updates_enabled}
            disabled={!alertsEnabled || saving || !canSyncPrefs}
            onChange={(enabled) => onPrefChange({ event_updates_enabled: enabled })}
            isLight={isLight}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: 20,
            background: isLight ? '#F3F3F3' : '#1A1A1A',
            color: isLight ? '#333' : '#DDD',
            border: `1px solid ${isLight ? '#E0E0E0' : '#2A2A2A'}`,
            borderRadius: 10,
            padding: 12,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  )
}
