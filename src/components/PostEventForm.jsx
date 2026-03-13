import { useState, useRef } from 'react'
import { createEvent, uploadEventPhoto } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 480, background: '#0F0F0F', borderRadius: '20px 20px 0 0', border: '1px solid #1A1A1A', maxHeight: '92vh', overflowY: 'auto', padding: '24px 20px 48px', animation: 'slideUp 0.3s ease' },
  label: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#555', letterSpacing: 1, display: 'block', marginBottom: 5, textTransform: 'uppercase' },
  input: { width: '100%', background: '#141414', border: '1px solid #222', borderRadius: 8, padding: '11px 13px', color: '#F0F0F0', fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none', marginBottom: 14, colorScheme: 'dark' },
  select: { width: '100%', background: '#141414', border: '1px solid #222', borderRadius: 8, padding: '11px 13px', color: '#F0F0F0', fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none', marginBottom: 14, colorScheme: 'dark', appearance: 'none' },
}

async function geocodeAddress(address) {
  const encoded = encodeURIComponent(address)
  const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`)
  const data = await res.json()
  if (data.length === 0) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

export default function PostEventForm({ onClose, onPosted }) {
  const { user } = useAuth()
  const fileRef = useRef()
  const [form, setForm] = useState({ title: '', type: 'meet', date: '', time: '', location: '', city: '', address: '', description: '', tags: '', host: '' })
  const [coords, setCoords] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState('')
  const [addressStatus, setAddressStatus] = useState('')

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return
    setGeocoding(true)
    setAddressStatus('')
    setCoords(null)
    try {
      const result = await geocodeAddress(form.address)
      if (result) {
        setCoords(result)
        setAddressStatus('found')
      } else {
        setAddressStatus('notfound')
      }
    } catch {
      setAddressStatus('error')
    } finally {
      setGeocoding(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.location || !form.city) {
      setError('Please fill in all required fields.')
      return
    }
    setError('')
    setLoading(true)
    try {
      let finalCoords = coords
      if (form.address && !finalCoords) {
        finalCoords = await geocodeAddress(form.address)
      }
      const tagsArray = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const eventPayload = {
        title: form.title, type: form.type, date: form.date, time: form.time,
        location: form.location, city: form.city, description: form.description,
        tags: tagsArray, host: form.host,
        lat: finalCoords?.lat || null, lng: finalCoords?.lng || null,
        user_id: user.id,
      }
      const created = await createEvent(eventPayload, user.id)
      if (photo) {
        const photoUrl = await uploadEventPhoto(photo, created.id)
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
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2, color: '#FF6B35' }}>POST A MEET</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 26, cursor: 'pointer' }}>×</button>
        </div>

        {error && <div style={{ background: '#1A0A0A', border: '1px solid #FF3535', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#FF6060' }}>{error}</div>}

        <label style={S.label}>Event Photo</label>
        <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #222', borderRadius: 10, marginBottom: 14, height: photoPreview ? 180 : 90, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#111' }}>
          {photoPreview ? <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="preview" /> : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, marginBottom: 4 }}>📸</div><div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#555' }}>Tap to add a photo</div></div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />

        <label style={S.label}>Event Type</label>
        <select style={S.select} value={form.type} onChange={e => set('type', e.target.value)}>
          <option value="meet">Meet</option>
          <option value="car show">Car Show</option>
          <option value="track day">Track Day</option>
          <option value="cruise">Cruise</option>
        </select>

        <label style={S.label}>Event Name *</label>
        <input style={S.input} placeholder="Sunday Funday Car Meet" value={form.title} onChange={e => set('title', e.target.value)} />

        <label style={S.label}>Street Address (places a pin on the map)</label>
        <input
          style={{ ...S.input, marginBottom: 4, borderColor: addressStatus === 'found' ? '#FF6B3580' : '#222' }}
          placeholder="123 Main St, Riverside, CA 92501"
          value={form.address}
          onChange={e => { set('address', e.target.value); setAddressStatus(''); setCoords(null) }}
          onBlur={handleAddressBlur}
        />
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 12, height: 16 }}>
          {geocoding && <span style={{ color: '#555' }}>🔍 Looking up address...</span>}
          {!geocoding && addressStatus === 'found' && <span style={{ color: '#FF6B35' }}>✓ Address found — pin will appear on map</span>}
          {!geocoding && addressStatus === 'notfound' && <span style={{ color: '#FF9944' }}>⚠️ Address not found — try adding city and state</span>}
        </div>

        <label style={S.label}>Venue / Spot Name *</label>
        <input style={S.input} placeholder="Walmart East Lot, AutoZone Parking" value={form.location} onChange={e => set('location', e.target.value)} />

        <label style={S.label}>City, State *</label>
        <input style={S.input} placeholder="Riverside, CA" value={form.city} onChange={e => set('city', e.target.value)} />

        <label style={S.label}>Hosted By</label>
        <input style={S.input} placeholder="Your crew / org name" value={form.host} onChange={e => set('host', e.target.value)} />

        <label style={S.label}>Tags (comma separated)</label>
        <input style={S.input} placeholder="JDM, Stance, All Welcome" value={form.tags} onChange={e => set('tags', e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={S.label}>Date *</label><input style={S.input} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
          <div><label style={S.label}>Time</label><input style={S.input} type="time" value={form.time} onChange={e => set('time', e.target.value)} /></div>
        </div>

        <label style={S.label}>Details</label>
        <textarea placeholder="What's the vibe? Rules, food trucks, special guests..." value={form.description} onChange={e => set('description', e.target.value)} rows={3} style={{ ...S.input, resize: 'none', marginBottom: 20 }} />

        <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', background: loading ? '#333' : '#FF6B35', color: loading ? '#666' : '#0A0A0A', border: 'none', borderRadius: 10, padding: 14, fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, cursor: loading ? 'default' : 'pointer' }}>
          {loading ? 'POSTING...' : 'DROP THE PIN 📍'}
        </button>
      </div>
    </div>
  )
}
