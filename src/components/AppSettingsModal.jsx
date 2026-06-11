import { useTheme } from '../lib/useTheme'
import { getDefaultDirectionsApp, setDirectionsAppPreference } from '../lib/directionsAppPreference'
import { useDirectionsAppPreference } from '../lib/useDirectionsAppPreference'

function ChoiceRow({ label, description, selected, onSelect, isLight }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 0',
        borderBottom: `1px solid ${isLight ? '#ECECEC' : '#1E1E1E'}`,
        cursor: 'pointer',
      }}
    >
      <input
        type="radio"
        name="directions-app"
        checked={selected}
        onChange={onSelect}
        style={{ marginTop: 3, accentColor: '#FF6B35', flexShrink: 0 }}
      />
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
    </label>
  )
}

export default function AppSettingsModal({ onClose }) {
  const { isLight } = useTheme()
  const directionsApp = useDirectionsAppPreference()
  const sheetBg = isLight ? '#FFFFFF' : '#0F0F0F'
  const sheetBorder = isLight ? '#E5E5E5' : '#1A1A1A'
  const muted = isLight ? '#666' : '#888'
  const defaultApp = getDefaultDirectionsApp()

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
        aria-labelledby="app-settings-title"
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
            id="app-settings-title"
            style={{
              margin: 0,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 28,
              letterSpacing: 1.5,
              color: isLight ? '#111' : '#F5F5F5',
            }}
          >
            SETTINGS
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
            margin: '0 0 8px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            lineHeight: 1.5,
            color: muted,
          }}
        >
          Choose which app opens when you tap Directions. Your choice is saved on this device.
        </p>

        <div
          style={{
            marginBottom: 8,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#FF6B35',
            fontWeight: 700,
          }}
        >
          Directions app
        </div>

        <ChoiceRow
          label="Apple Maps"
          description="Opens the Apple Maps app on iPhone and iPad."
          selected={directionsApp === 'apple'}
          onSelect={() => setDirectionsAppPreference('apple')}
          isLight={isLight}
        />
        <ChoiceRow
          label="Google Maps"
          description="Opens Google Maps in the browser or app."
          selected={directionsApp === 'google'}
          onSelect={() => setDirectionsAppPreference('google')}
          isLight={isLight}
        />

        <p
          style={{
            margin: '12px 0 0',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: muted,
          }}
        >
          Default on this device: {defaultApp === 'apple' ? 'Apple Maps' : 'Google Maps'}
        </p>

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
