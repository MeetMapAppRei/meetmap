import { useState, useRef } from 'react'
import { createEvent, uploadEventPhoto } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'

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

async function extractFlyerInfo(imageBase64, mediaType = "image/jpeg") {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageBase64 }
          },
          {
            type: 'text',
            text: `Extract car meet event info from this flyer. Return ONLY a JSON object with these fields (no markdown, no explanation):
{
  "title": "event name",
  "type": "meet|car show|track day|cruise",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "location": "venue/spot name",
  "address": "full street address if visible",
  "city": "City, ST",
  "host": "organizer name",
  "description": "any details about the event",
  "tags": "comma separated tags like JDM, All Makes, etc"
}
If a field is not found, use empty string. For date, convert to YYYY-MM-DD format using the current year ${new Date().getFullYear()} if no year is specified on the flyer. For time use 24hr format.`
          }
        ]
      }]
    })
  })
  const data = await response.json()
  const text = data.content?.[0]?.text || ''
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

export default function PostEventForm({ onClose, onPosted }) {
  const { user } = useAuth()
  const { isLight } = useTheme()
  const fileRef = useRef()
  const flyerRef = useRef()
  const [form, setForm] = useState({ title: '', type: 'meet', date: '', time: '', location: '', city: '', address: '', description: '', tags: '', host: '' })
  const [coords, setCoords] = useState(null)
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [error, setError] = useState('')
  const [addressStatus, setAddressStatus] = useState('')
  const [flyerSuccess, setFlyerSuccess] = useState(false)

  const overlayStyle = { ...S.overlay, background: isLight ? 'rgba(0,0,0,0.28)' : S.overlay.background }
  const sheetStyle = {
    ...S.sheet,
    background: isLight ? '#FFFFFF' : S.sheet.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#1A1A1A'}`,
  }
  const labelStyle = { ...S.label, color: isLight ? '#666' : S.label.color }
  const inputStyle = {
    ...S.input,
    background: isLight ? '#FFFFFF' : S.input.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#222'}`,
    color: isLight ? '#111111' : S.input.color,
    colorScheme: isLight ? 'light' : 'dark',
  }
  const selectStyle = {
    ...S.select,
    background: isLight ? '#FFFFFF' : S.select.background,
    border: `1px solid ${isLight ? '#E5E5E5' : '#222'}`,
    color: isLight ? '#111111' : S.select.color,
    colorScheme: isLight ? 'light' : 'dark',
  }
  const closeColor = isLight ? '#666' : '#555'
  const errorStyle = {
    background: isLight ? '#FFF1F1' : '#1A0A0A',
    border: `1px solid ${isLight ? '#FF6B6B55' : '#FF353544'}`,
    borderRadius: 8,
    padding: '10px 14px',
    marginBottom: 14,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    color: isLight ? '#B00020' : '#FF6060',
  }
  const photoBorder = isLight ? '#E5E5E5' : '#222'
  const photoBg = isLight ? '#F7F7F7' : '#111'
  const geocodeText = isLight ? '#666' : '#555'

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const handlePhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const handleFlyerUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    setError('')
    setFlyerSuccess(false)
    try {
      // Convert to base64
      const mediaType = file.type || 'image/jpeg'
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const info = await extractFlyerInfo(base64, mediaType)
      // Fill in the form with extracted info
      setForm(prev => ({
        ...prev,
        title: info.title || prev.title,
        type: info.type || prev.type,
        date: info.date || prev.date,
        time: info.time || prev.time,
        location: info.location || prev.location,
        address: info.address || prev.address,
        city: info.city || prev.city,
        host: info.host || prev.host,
        description: info.description || prev.description,
        tags: info.tags || prev.tags,
      }))
      setFlyerSuccess(true)
      // Auto-geocode if address was found
      if (info.address) {
        const result = await geocodeAddress(info.address)
        if (result) { setCoords(result); setAddressStatus('found') }
      }
    } catch (e) {
      setError('Could not read flyer. Try a clearer image or fill in manually.')
    } finally {
      setScanning(false)
    }
  }

  const handleAddressBlur = async () => {
    if (!form.address.trim()) return
    setGeocoding(true); setAddressStatus(''); setCoords(null)
    try {
      const result = await geocodeAddress(form.address)
      if (result) { setCoords(result); setAddressStatus('found') }
      else setAddressStatus('notfound')
    } catch { setAddressStatus('error') }
    finally { setGeocoding(false) }
  }

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.location || !form.city) {
      setError('Please fill in all required fields.')
      return
    }
    setError(''); setLoading(true)
    try {
      let finalCoords = coords
      if (form.address && !finalCoords) finalCoords = await geocodeAddress(form.address).catch(() => null)
      const tagsArray = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const eventPayload = {
        title: form.title, type: form.type, date: form.date, time: form.time,
        location: form.location, city: form.city, address: form.address, description: form.description,
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
      onPosted(created); onClose()
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div style={sheetStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, letterSpacing: 2, color: '#FF6B35' }}>POST A MEET</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: closeColor, fontSize: 26, cursor: 'pointer' }}>×</button>
        </div>

        {/* FLYER IMPORT BUTTON */}
        <div
          onClick={() => flyerRef.current.click()}
          style={{
            border: scanning ? '2px solid #FF6B35' : '2px dashed #FF6B3555',
            borderRadius: 12, padding: '14px', marginBottom: 18,
            cursor: scanning ? 'default' : 'pointer',
            background: flyerSuccess
              ? (isLight ? '#ECFFF2' : '#0A1A0A')
              : (isLight ? '#FFFFFF' : '#0F0F0F'),
            display: 'flex', alignItems: 'center', gap: 12,
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: 28 }}>{scanning ? '⏳' : flyerSuccess ? '✅' : '📸'}</div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1.5, color: flyerSuccess ? '#7CFF6B' : '#FF6B35' }}>
              {scanning ? 'READING FLYER...' : flyerSuccess ? 'FLYER IMPORTED!' : 'IMPORT FROM FLYER'}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: geocodeText, marginTop: 2 }}>
              {scanning ? 'AI is extracting event details...' : flyerSuccess ? 'Review the details below and edit if needed' : 'Upload a flyer and AI will fill in the details'}
            </div>
          </div>
          {scanning && <div style={{ marginLeft: 'auto', width: 18, height: 18, border: '2px solid #FF6B35', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
        </div>
        <input ref={flyerRef} type="file" accept="image/*" onChange={handleFlyerUpload} style={{ display: 'none' }} />

        {error && <div style={errorStyle}>{error}</div>}

        {/* Photo upload */}
        <label style={labelStyle}>Event Photo</label>
        <div
          onClick={() => fileRef.current.click()}
          style={{ border: `2px dashed ${photoBorder}`, borderRadius: 10, marginBottom: 14, height: photoPreview ? 180 : 90, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: photoBg }}
        >
          {photoPreview ? <img src={photoPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="preview" /> : <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, marginBottom: 4 }}>📸</div><div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: geocodeText }}>Tap to add a photo</div></div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />

        <label style={labelStyle}>Event Type</label>
        <select style={selectStyle} value={form.type} onChange={e => set('type', e.target.value)}>
          <option value="meet">Meet</option>
          <option value="car show">Car Show</option>
          <option value="track day">Track Day</option>
          <option value="cruise">Cruise</option>
        </select>

        <label style={labelStyle}>Event Name *</label>
        <input style={inputStyle} placeholder="Sunday Funday Car Meet" value={form.title} onChange={e => set('title', e.target.value)} />

        <label style={labelStyle}>Street Address (for map pin)</label>
        <input
          style={{ ...inputStyle, marginBottom: 4, borderColor: addressStatus === 'found' ? '#FF6B3580' : photoBorder }}
          placeholder="123 Main St, Riverside, CA 92501"
          value={form.address}
          onChange={e => { set('address', e.target.value); setAddressStatus(''); setCoords(null) }}
          onBlur={handleAddressBlur}
        />
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 12, height: 16 }}>
          {geocoding && <span style={{ color: geocodeText }}>🔍 Looking up address...</span>}
          {!geocoding && addressStatus === 'found' && <span style={{ color: '#FF6B35' }}>✓ Address found — pin will appear on map</span>}
          {!geocoding && addressStatus === 'notfound' && <span style={{ color: '#FF9944' }}>⚠️ Address not found — try adding city and state</span>}
        </div>

        <label style={labelStyle}>Venue / Spot Name *</label>
        <input style={inputStyle} placeholder="Walmart East Lot, AutoZone Parking" value={form.location} onChange={e => set('location', e.target.value)} />

        <label style={labelStyle}>City, State *</label>
        <input style={inputStyle} placeholder="Riverside, CA" value={form.city} onChange={e => set('city', e.target.value)} />

        <label style={labelStyle}>Hosted By</label>
        <input style={inputStyle} placeholder="Your crew / org name" value={form.host} onChange={e => set('host', e.target.value)} />

        <label style={labelStyle}>Tags (comma separated)</label>
        <input style={inputStyle} placeholder="JDM, Stance, All Welcome" value={form.tags} onChange={e => set('tags', e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label style={labelStyle}>Date *</label><input style={inputStyle} type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
          <div><label style={labelStyle}>Time</label><input style={inputStyle} type="time" value={form.time} onChange={e => set('time', e.target.value)} /></div>
        </div>

        <label style={labelStyle}>Details</label>
        <textarea
          placeholder="What's the vibe? Rules, food trucks, special guests..."
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: 'none', marginBottom: 20 }}
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? (isLight ? '#E5E5E5' : '#333') : '#FF6B35',
            color: loading ? (isLight ? '#666' : '#666') : '#0A0A0A',
            border: 'none',
            borderRadius: 10,
            padding: 14,
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20,
            letterSpacing: 2,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'POSTING...' : 'DROP THE PIN 📍'}
        </button>
      </div>
    </div>
  )
}
