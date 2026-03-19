function looksLikeProfileImage(url) {
  const u = String(url || '').toLowerCase()
  return (
    u.includes('profile') ||
    u.includes('avatar') ||
    u.includes('default') ||
    u.includes('small') ||
    u.includes('icon') ||
    u.includes('logo')
  )
}

function upgradeInstagramImage(url) {
  if (!url) return url
  // Many IG CDN URLs include /s640x640/ or /s320x320/ etc. Try bumping size.
  return String(url).replace(/\/s\d+x\d+\//, '/s1080x1080/')
}

function bestFromSrcset(srcset) {
  const s = String(srcset || '')
  if (!s) return null
  // srcset format: "url1 640w, url2 1080w"
  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  let best = null
  for (const p of parts) {
    const [urlPart, wPart] = p.split(/\s+/)
    const w = parseInt(String(wPart || '').replace('w', ''), 10)
    if (!urlPart) continue
    if (Number.isFinite(w)) {
      if (!best || w > best.w) best = { url: urlPart, w }
    }
  }
  return best?.url || null
}

function getBestImageUrl() {
  const og = document.querySelector('meta[property="og:image"]')
  const twitter = document.querySelector('meta[property="twitter:image"]')
  const ogSecure = document.querySelector('meta[property="og:image:secure_url"]')
  const p = window.location.pathname
  const isReelsPage = p.startsWith('/reels/') || p.startsWith('/reel/') || p.startsWith('/tv/')

  const mainArea = document.querySelector('div[role="main"]') || document

  // On reels/videos, prefer OG/Twitter meta first because DOM images are frequently
  // resized/cropped for in-feed display (which causes the "cut off" flyers you saw).
  if (isReelsPage) {
    const ogVal = ogSecure?.content || og?.content || twitter?.content
    if (ogVal && !looksLikeProfileImage(ogVal)) return upgradeInstagramImage(ogVal)
    const video = document.querySelector('video')
    const poster = video?.poster
    if (poster && !looksLikeProfileImage(poster)) return upgradeInstagramImage(poster)

    // If meta/poster is missing, only then fall back to the main media area's srcset.
    const mainMediaImg = mainArea.querySelector('article img[srcset], article img[src]')
    if (mainMediaImg) {
      const srcset = mainMediaImg.getAttribute('srcset')
      const best = bestFromSrcset(srcset)
      const candidate = best || mainMediaImg.src
      if (candidate && !looksLikeProfileImage(candidate)) return upgradeInstagramImage(candidate)
    }
  }

  if (ogSecure?.content && !looksLikeProfileImage(ogSecure.content)) return upgradeInstagramImage(ogSecure.content)
  if (og?.content && !looksLikeProfileImage(og.content)) return upgradeInstagramImage(og.content)
  if (twitter?.content && !looksLikeProfileImage(twitter.content)) return upgradeInstagramImage(twitter.content)

  // If it's a reels/video page but poster was missing, keep using video.poster as a fallback.
  if (isReelsPage) {
    const video = document.querySelector('video')
    const poster = video?.poster
    if (poster && !looksLikeProfileImage(poster)) return upgradeInstagramImage(poster)
  }

  // Fallback: try common post image containers.
  const articleImg = document.querySelector('article img')
  if (articleImg && articleImg.src && !looksLikeProfileImage(articleImg.src)) return upgradeInstagramImage(articleImg.src)

  // Last resort: scan images, but avoid this on reels/video pages because there are often
  // multiple thumbnails/frames and we can pick the wrong one.
  if (isReelsPage) return null

  const imgs = Array.from(document.images || [])
  if (imgs.length === 0) return null

  // Pick the largest image by area as a simple heuristic (avoid obvious avatars/icons).
  let best = null
  for (const img of imgs) {
    const w = img.naturalWidth || 0
    const h = img.naturalHeight || 0
    if (!w || !h) continue
    if (looksLikeProfileImage(img.src)) continue
    if (!best || w * h > best.w * best.h) best = { url: img.src, w, h }
  }
  return best?.url ? upgradeInstagramImage(best.url) : null
}

function ensureButton() {
  if (document.getElementById('meetmap-importer-btn')) return

  // Only show on likely post pages.
  const p = window.location.pathname
  // Instagram uses multiple patterns: /p/... (posts), /reels/... (reels), /tv/... (videos)
  const looksLikePost =
    p.startsWith('/p/') ||
    p.startsWith('/reels/') ||
    p.startsWith('/reel/') ||
    p.startsWith('/tv/')
  if (!looksLikePost) return

  const btn = document.createElement('button')
  btn.id = 'meetmap-importer-btn'
  btn.textContent = 'Import Flyer'

  btn.style.position = 'fixed'
  btn.style.right = '18px'
  btn.style.bottom = '18px'
  btn.style.zIndex = 999999
  btn.style.padding = '10px 14px'
  btn.style.borderRadius = '999px'
  btn.style.border = 'none'
  btn.style.cursor = 'pointer'
  btn.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial'
  btn.style.fontWeight = '700'
  btn.style.background = '#FF6B35'
  btn.style.color = '#0A0A0A'
  btn.style.boxShadow = '0 10px 30px rgba(0,0,0,0.25)'

  btn.addEventListener('click', async () => {
    const u = new URL(window.location.href)
    // Normalize to avoid dedupe misses caused by tracking params like ?igsh=...
    const sourceUrl = `${u.origin}${u.pathname}`
    const imageUrl = getBestImageUrl()

    if (!imageUrl) {
      alert('Could not find the flyer image on this post. Try a different post.')
      return
    }

    const meetmapUrl = 'https://meetmap-gilt.vercel.app/'
    const url =
      `${meetmapUrl}?import=1` +
      `&sourceUrl=${encodeURIComponent(sourceUrl)}` +
      `&imageUrl=${encodeURIComponent(imageUrl)}`

    // Ask the background service worker to open the tab.
    // Content scripts sometimes don't have `chrome.tabs` available.
    chrome.runtime.sendMessage({ type: 'OPEN_MEETMAP_IMPORT', url })
  })

  document.body.appendChild(btn)
}

// Instagram is dynamic; try repeatedly for a short time.
let tries = 0
const timer = setInterval(() => {
  tries += 1
  ensureButton()
  if (tries > 20) clearInterval(timer)
}, 500)

