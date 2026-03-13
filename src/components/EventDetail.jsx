import { useState, useEffect, useRef } from 'react'
import { fetchComments, postComment, toggleAttendance, getAttendanceStatus, supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

const TYPE_COLORS = {
  meet: '#FF6B35', 'car show': '#FFD700', 'track day': '#00D4FF', cruise: '#7CFF6B',
}

export default function EventDetail({ event, onClose, onAuthNeeded, onDeleted }) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [attending, setAttending] = useState(false)
  const [attendeeCount, setAttendeeCount] = useState(event.attendee_count || 0)
  const [posting, setPosting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const bottomRef = useRef()

  const color = TYPE_COLORS[event.type] || '#FF6B35'
  const isOwner = user && event.user_id === user.id

  useEffect(() => {
    fetchComments(event.id).then(setComments).catch(console.error)
    if (user) {
      getAttendanceStatus(event.id, user.id).then(setAttending)
    }
  }, [event.id, user])

  const handleAttend = async () => {
    if (!user) return onAuthNeeded()
    const isNowAttending = await toggleAttendance(event.id, user.id)
    setAttending(isNowAttending)
    setAttendeeCount(prev => isNowAttending ? prev + 1 : prev - 1)
  }

  const handleComment = async () => {
    if (!user) return onAuthNeeded()
    if (!commentText.trim()) return
    setPosting(true)
    try {
      const comment = await postComment(event.id, user.id, commentText.trim())
      setComments(prev => [...prev, comment])
      setCommentText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch (e) {
      console.error(e)
    } finally {
      setPosting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await supabase.from('events').delete().eq('id', event.id)
      onDeleted(event.id)
      onClose()
    } catch (e) {
      console.error(e)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleShare = async () => {
    const url = `${window.location.origin}?event=${event.id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const isPast = event.date < today

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 700, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      <div style={{ width: '100%', maxWidth: 480, background: '#0F0F0F', borderRadius: '20px 20px 0 0', border: '1px solid #1A1A1A', maxHeight: '92vh', overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>

        {/* Hero image or color band */}
        {event.photo_url ? (
          <div style={{ position: 'relative', height: 200 }}>
            <img src={event.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={event.title} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0F0F0F 0%, transparent 60%)' }} />
            <button onClick={onClose} style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', fontSize: 22, width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        ) : (
          <div style={{ height: 8, background: color, borderRadius: '20px 20px 0 0' }} />
        )}

        <div style={{ padding: '20px 20px 0' }}>
          {!event.photo_url && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#555', fontSize: 26, cursor: 'pointer' }}>×</button>
            </div>
          )}

          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700, background: color + '22', color, padding: '3px 10px', borderRadius: 20, textTransform: 'capitalize', letterSpacing: 0.5 }}>
            {event.type}
          </span>

          <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 30, letterSpacing: 1.5, marginTop: 10, marginBottom: 4, lineHeight: 1.1 }}>{event.title}</h2>

          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', marginBottom: 6 }}>
            📍 {event.location} · {event.city}
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', marginBottom: 6 }}>
            <span style={{ color }}> 📅 {event.date}</span>
            {event.time && <span> · ⏰ {event.time}</span>}
          </div>
          {event.host && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#666', marginBottom: 10 }}>
              🎤 Hosted by <span style={{ color: '#aaa' }}>{event.host}</span>
            </div>
          )}

          {event.tags?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {event.tags.map(tag => (
                <span key={tag} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600, border: `1px solid ${color}44`, color, background: color + '0D', margin: '2px' }}>{tag}</span>
              ))}
            </div>
          )}

          {event.description && (
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#888', lineHeight: 1.6, marginBottom: 16 }}>
              {event.description}
            </p>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: isOwner ? 10 : 24 }}>
            {!isPast && (
              <button onClick={handleAttend} style={{ flex: 2, background: attending ? 'transparent' : color, color: attending ? color : '#0A0A0A', border: `1px solid ${color}`, borderRadius: 10, padding: '12px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 1.5, cursor: 'pointer' }}>
                {attending ? `✓ YOU'RE GOING · ${attendeeCount}` : `I'M IN · ${attendeeCount} GOING`}
              </button>
            )}
            <button onClick={handleShare} style={{ flex: 1, background: '#141414', color: copied ? '#7CFF6B' : '#888', border: '1px solid #222', borderRadius: 10, padding: '12px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 1, cursor: 'pointer' }}>
              {copied ? '✓ COPIED!' : '🔗 SHARE'}
            </button>
          </div>

          {/* Delete button — only shown to event owner */}
          {isOwner && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%', background: 'transparent', color: '#555', border: '1px solid #222', borderRadius: 10, padding: '10px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, letterSpacing: 1, cursor: 'pointer', marginBottom: 24 }}
            >
              🗑 DELETE MY EVENT
            </button>
          )}

          {/* Confirm delete */}
          {isOwner && confirmDelete && (
            <div style={{ background: '#1A0A0A', border: '1px solid #FF353544', borderRadius: 12, padding: '16px', marginBottom: 24 }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#FF6060', marginBottom: 12, textAlign: 'center' }}>
                Are you sure? This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ flex: 1, background: '#141414', color: '#888', border: '1px solid #222', borderRadius: 8, padding: '10px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, cursor: 'pointer' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ flex: 1, background: '#FF3535', color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, cursor: 'pointer', letterSpacing: 1 }}
                >
                  {deleting ? 'DELETING...' : 'YES, DELETE'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#1A1A1A' }} />

        {/* Comments */}
        <div style={{ padding: '16px 20px 24px' }}>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, color: '#555', marginBottom: 16 }}>
            COMMENTS {comments.length > 0 && <span style={{ color }}>{comments.length}</span>}
          </div>

          {comments.length === 0 && (
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#333', textAlign: 'center', padding: '20px 0' }}>
              No comments yet. Be the first! 👇
            </div>
          )}

          {comments.map(c => (
            <div key={c.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: color + '33', border: `1px solid ${color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Bebas Neue', sans-serif", fontSize: 14, color }}>
                  {(c.profiles?.username || 'U')[0].toUpperCase()}
                </div>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: '#aaa' }}>{c.profiles?.username || 'Anonymous'}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#333' }}>{new Date(c.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888', paddingLeft: 36, lineHeight: 1.5 }}>{c.text}</div>
            </div>
          ))}
          <div ref={bottomRef} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <input
              placeholder={user ? 'Add a comment...' : 'Log in to comment'}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}
              disabled={!user}
              style={{ flex: 1, background: '#141414', border: '1px solid #222', borderRadius: 8, padding: '10px 13px', color: '#F0F0F0', fontFamily: "'DM Sans', sans-serif", fontSize: 13, outline: 'none' }}
            />
            <button onClick={user ? handleComment : onAuthNeeded} disabled={posting} style={{ background: color, color: '#0A0A0A', border: 'none', borderRadius: 8, padding: '0 16px', fontFamily: "'Bebas Neue', sans-serif", fontSize: 15, cursor: 'pointer', letterSpacing: 1 }}>
              {posting ? '...' : 'POST'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
