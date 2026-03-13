import { useState, useRef } from 'react'
import { createEvent, uploadEventPhoto } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)',
    zIndex: 600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  },
  sheet: {
    width: '100%', maxWidth: 480, background: '#0F0F0F',
    borderRadius: '20px 20px 0 0', border: '1px solid #1A1A1A',
    maxHeight: '92vh', overflowY: 'auto', padding: '24px 20px 48px',
    animation: 'slideUp 0.3s ease',
  },
  label: {
    fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#555',
    letterSpacing: 1, display: 'block', marginBottom: 5, textTransform: 'uppercase',
  },
  input: {
    width: '100%', background: '#141414', border: '1px solid #222',
    borderRadius: 8, padding: '11px 13px', color: '#F0F0F0',
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
    marginBottom: 14, colorScheme: 'dark',
  },
  select: {
    width: '100%', background: '#141414', border: '1px solid #222',
    borderRadius: 8, padding: '11px 13px', color: '#F0F0F0',
    fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none',
    marginBottom: 14, colorScheme: 'dark', appearance: 'none',
  },
}

const FIELDS = [
  { label: 'Event Name *', key: 'title', placeholder: 'Sunday Funday Car Meet' },
  { label: 'Location / Venue *', key: 'location', placeholder: 'Walmart East Lot, Main St' },
  { label: 'City, State *', key: 'city', placeholder: 'Riverside, CA' },
  { label: 'Latitude (optional)', key: 'lat', placeholder: 'e.g. 33.9806 — for map pin' },
  { label: 'Longitude (optional)', key: 'lng', placeholder: 'e.g. -117.3755 — for map pin' },
  { label: 'Hosted By', key: 'host', placeholder: 'Your crew / org name' },
  { label: 'Tags (comma separated)', key: 'tags', placeholder: 'JDM, Stance, All Welcome' },
]

export default function PostEventForm({ onClose, onPosted }) {
  const { user } = useAuth()
  const fileRef = useRef()
  const [form, setForm] = useState({
    title: '', type: 'meet', date: '', time: '',
    location: '', city: '', lat: '', lng: '',
    description: '', tags: '', host: '',
  })
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.location || !form.city) {
      setError('Please fill in all required fields.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const tagsArray = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const eventPayload = {
        ...form,
        tags: tagsArray,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        user_id: user.id,
      }
      const created = await createEvent(eventPayload, user.id)
      if (photo) {
        const photoUrl = await uploadEventPhoto(photo, created.id)
        // update event with photo url
        const { supabase } = await import('../lib/supabase')
        await supabase.from('events').update({ photo_url: photoUrl }).eq('id', created.id)
        created.photo_url = photoUrl
      }
      onPosted(created)
      onClose()
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2, color: '#FF6B35' }}>
            POST A MEET
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 26, cursor: 'pointer' }}>×</button>
        </div>

        {error && (
          <div style={{ background: '#1A0A0A', border: '1px solid #FF3535', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#FF6060' }}>
            {error}
          </div>
        )}

        {/* Photo Upload */}
        <label style={S.label}>Event Photo</label>
        <div
          onClick={() => fileRef.current.click()}
          style={{
            border: '2px dashed #222', borderRadius: 10, marginBottom: 14,
            height: photoPreview ? 180 : 90, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative', background: '#111',
            transition: 'border-color 0.2s',
          }}
        >
          {photoPreview ? (
            <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="preview" />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>📸</div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>Tap to add a photo</div>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />

        {/* Event Type */}
        <label style={S.label}>Event Type</label>
        <select style={S.select} value={form.type} onChange={e => set('type', e.target.value)}>
          <option value="meet">Meet</option>
          <option value="car show">Car Show</option>
          <option value="track day">Track Day</option>
          <option value="cruise">Cruise</option>
        </select>

        {/* Text Fields */}
        {FIELDS.map(f => (
          <div key={f.key}>
            <label style={S.label}>{f.label}</label>
            <input style={S.input} placeholder={f.placeholder} value={form[f.key]} onChange={e => set(f.key, e.target.value)} />
          </div>
        ))}

        {/* Date + Time row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={S.label}>Date *</label>
            <input style={S.input} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Time</label>
            <input style={S.input} type="time" value={form.time} onChange={e => set('time', e.target.value)} />
          </div>
        </div>

        {/* Description */}
        <label style={S.label}>Details</label>
        <textarea
          placeholder="What's the vibe? Rules, food trucks, special guests..."
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
          style={{ ...S.input, resize: 'none', marginBottom: 20 }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', background: loading ? '#333' : '#FF6B35',
            color: loading ? '#666' : '#0A0A0A', border: 'none',
            borderRadius: 10, padding: 14, fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20, letterSpacing: 2, cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'POSTING...' : 'DROP THE PIN 📍'}
        </button>

        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#333', textAlign: 'center', marginTop: 12 }}>
          Tip: Get lat/lng from Google Maps → right-click your location
        </div>
      </div>
    </div>
  )
}
