import { useState, useRef } from 'react'
import { createEvent, uploadEventPhoto } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { apiUrl } from '../lib/apiOrigin'
import { geocodeAddress, humanizeFetchError } from '../lib/geocode'
import { compressImageForUpload } from '../lib/compressImageForUpload'

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 480, background: '#0F0F0F', borderRadius: '20px 20px 0 0', border: '1px solid #1A1A1A', maxHeight: '92vh', overflowY: 'auto', padding: '24px 20px 48px', animation: 'slideUp 0.3s ease' },
  label: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#555', letterSpacing: 1, display: 'block', marginBottom: 5, textTransform: 'uppercase' },
  input: { width: '100%', background: '#141414', border: '1px solid #222', borderRadius: 8, padding: '11px 13px', color: '#F0F0F0', fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none', marginBottom: 14, colorScheme: 'dark' },
  select: { width: '100%', background: '#141414', border: '1px solid #222', borderRadius: 8, padding: '11px 13px', color: '#F0F0F0', fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: 'none', marginBottom: 14, colorScheme: 'dark', appearance: 'none' },
}

async function postExtractFlyer(endpoint, imageBase64, mediaType = "image/jpeg") {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeout = controller ? setTimeout(() => controller.abort(), 25000) : null
  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64,
        mediaType,
      }),
      signal: controller?.signal,
    })
  } finally {
    if (timeout) clearTimeout(timeout)
  }
  return response
}

async function extractFlyerInfoOnce(imageBase64, mediaType = "image/jpeg") {
  const candidates = [
    apiUrl('/api/extract-flyer'),
    'https://findcarmeets.com/api/extract-flyer',
    'https://meetmap-gilt.vercel.app/api/extract-flyer',
  ]
  const endpoints = Array.from(new Set(candidates.filter(Boolean)))
  let response = null
  let lastNetworkError = null

  for (const endpoint of endpoints) {
    try {
      response = await postExtractFlyer(endpoint, imageBase64, mediaType)
      // If endpoint responded at all, parse result (even if non-200) and stop trying others.
      break
    } catch (e) {
      lastNetworkError = e
      const msg = String(e?.message || '')
      const retryableNetwork = /failed to fetch|networkerror|load failed|network request failed|abort|timeout/i.test(msg)
      if (!retryableNetwork) throw e
    }
  }

  if (!response) {
    throw lastNetworkError || new Error('Connection problem while reading flyer.')
  }

  const responseUrl = response.url || ''
  const isFallback = responseUrl.includes('findcarmeets.com') || responseUrl.includes('meetmap-gilt.vercel.app')
  const status = response.status
  const statusText = response.statusText
  const contentType = response.headers.get('content-type') || ''
  const rawText = await response.text()
  let data = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch {
    data = {}
  }

  if (!response.ok) {
    const err =
      data?.error?.message ||
      data?.error ||
      data?.message ||
      (status === 413 ? 'Flyer image is too large. Try a smaller/cropped image.' : '') ||
      statusText ||
      `Request failed (${status})`
    throw new Error(isFallback ? `${err}` : err)
  }

  if (!('extracted' in (data || {})) || data?.extracted == null) {
    const preview = (rawText || JSON.stringify(data) || '')
      .replace(/\s+/g, ' ')
      .slice(0, 220)
    throw new Error(`No extracted data returned (status ${status}, content-type "${contentType}"). Response: ${preview}`)
  }
  return data.extracted
}

async function extractFlyerInfo(imageBase64, mediaType = "image/jpeg") {
  const maxAttempts = 3
  let lastErr
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (i > 0) await new Promise((r) => setTimeout(r, 750 * i))
      return await extractFlyerInfoOnce(imageBase64, mediaType)
    } catch (e) {
      lastErr = e
      const msg = e?.message || ''
      const retryable = /failed to fetch|networkerror|load failed|network request failed|timeout|abort/i.test(msg)
      if (retryable && i < maxAttempts - 1) continue
      throw e
    }
  }
  throw lastErr
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
  const [missingFields, setMissingFields] = useState([])
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
    // Reuse the flyer as the event photo so users don't need a second upload.
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
    setScanning(true)
    setError('')
    setFlyerSuccess(false)
    try {
      // The backend has a request body limit, and base64 inflates payload size.
      // Compress first for better mobile reliability.
      const aiFile = await compressImageForUpload(file, { maxWidth: 1400, quality: 0.8 })
      if (aiFile.size > 8 * 1024 * 1024) {
        throw new Error('That flyer file is too large for AI extraction on mobile. Try a smaller/cropped image (under ~8MB).')
      }

      // Convert to base64
      const mediaType = aiFile.type || file.type || 'image/jpeg'
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(aiFile)
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
      // Auto-geocode after import — failures must not look like "flyer failed" (see green success banner).
      if (info.address) {
        try {
          const result = await geocodeAddress(info.address)
          if (result) {
            setCoords(result)
            setAddressStatus('found')
          } else {
            setAddressStatus('notfound')
          }
        } catch {
          setAddressStatus('error')
        }
      }
    } catch (e) {
      const msg = humanizeFetchError(e) || (typeof e === 'string' ? e : String(e))
      setError(msg || 'Could not read flyer. Try a clearer image or fill in manually.')
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
    } catch {
      setAddressStatus('error')
    }
    finally { setGeocoding(false) }
  }

  const handleSubmit = async () => {
    const required = [
      { key: 'title', label: 'Event Name' },
      { key: 'date', label: 'Date' },
      { key: 'city', label: 'City, State' },
    ]
    const missing = required.filter(f => !String(form[f.key] || '').trim())
    if (missing.length > 0) {
      setMissingFields(missing.map(m => m.key))
      setError(`Please complete: ${missing.map(m => m.label).join(', ')}.`)
      return
    }
    setMissingFields([])
    setError(''); setLoading(true)
    try {
      let finalCoords = coords
      if (form.address && !finalCoords) finalCoords = await geocodeAddress(form.address).catch(() => null)
      const tagsArray = form.tags.split(',').map(t => t.trim()).filter(Boolean)
      const safeLocation = String(form.location || '').trim() || String(form.city || '').trim()
      const eventPayload = {
        title: form.title, type: form.type, date: form.date, time: form.time,
        // DB requires location, so if it's omitted we safely fall back to city.
        location: safeLocation, city: form.city, address: form.address, description: form.description,
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
    } catch (e) {
      setError(humanizeFetchError(e))
    }
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
        <input
          style={{ ...inputStyle, borderColor: missingFields.includes('title') ? '#FF6060' : inputStyle.border }}
          placeholder="Sunday Funday Car Meet"
          value={form.title}
          onChange={e => {
            set('title', e.target.value)
            if (missingFields.includes('title')) setMissingFields(prev => prev.filter(k => k !== 'title'))
          }}
        />

        <label style={labelStyle}>Street Address (for map pin)</label>
        <input
          style={{ ...inputStyle, marginBottom: 4, borderColor: addressStatus === 'found' ? '#FF6B3580' : photoBorder }}
          placeholder="123 Main St, Riverside, CA 92501"
          value={form.address}
          onChange={e => { set('address', e.target.value); setAddressStatus(''); setCoords(null) }}
          onBlur={handleAddressBlur}
        />
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, marginBottom: 12, minHeight: 16 }}>
          {geocoding && <span style={{ color: geocodeText }}>🔍 Looking up address...</span>}
          {!geocoding && addressStatus === 'found' && <span style={{ color: '#FF6B35' }}>✓ Address found — pin will appear on map</span>}
          {!geocoding && addressStatus === 'notfound' && <span style={{ color: '#FF9944' }}>⚠️ Address not found — try adding city and state</span>}
          {!geocoding && addressStatus === 'error' && (
            <span style={{ color: '#FF9944' }}>
              ⚠️ Couldn’t verify address on the map (connection issue). Tap the address field and tap away to retry.
            </span>
          )}
        </div>

        <label style={labelStyle}>Venue / Spot Name (optional)</label>
        <input
          style={{ ...inputStyle, borderColor: missingFields.includes('location') ? '#FF6060' : inputStyle.border }}
          placeholder="Walmart East Lot, AutoZone Parking"
          value={form.location}
          onChange={e => {
            set('location', e.target.value)
            if (missingFields.includes('location')) setMissingFields(prev => prev.filter(k => k !== 'location'))
          }}
        />

        <label style={labelStyle}>City, State *</label>
        <input
          style={{ ...inputStyle, borderColor: missingFields.includes('city') ? '#FF6060' : inputStyle.border }}
          placeholder="Riverside, CA"
          value={form.city}
          onChange={e => {
            set('city', e.target.value)
            if (missingFields.includes('city')) setMissingFields(prev => prev.filter(k => k !== 'city'))
          }}
        />

        <label style={labelStyle}>Hosted By</label>
        <input style={inputStyle} placeholder="Your crew / org name" value={form.host} onChange={e => set('host', e.target.value)} />

        <label style={labelStyle}>Tags (comma separated)</label>
        <input style={inputStyle} placeholder="JDM, Stance, All Welcome" value={form.tags} onChange={e => set('tags', e.target.value)} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input
              style={{ ...inputStyle, borderColor: missingFields.includes('date') ? '#FF6060' : inputStyle.border }}
              type="date"
              value={form.date}
              onChange={e => {
                set('date', e.target.value)
                if (missingFields.includes('date')) setMissingFields(prev => prev.filter(k => k !== 'date'))
              }}
            />
          </div>
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
