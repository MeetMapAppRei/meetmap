function getBestImageUrl() {
  const og = document.querySelector('meta[property="og:image"]')
  if (og && og.content) return og.content

  // Fallback: try common post image containers.
  const articleImg = document.querySelector('article img')
  if (articleImg && articleImg.src) return articleImg.src

  const imgs = Array.from(document.images || [])
  if (imgs.length === 0) return null

  // Pick the largest image by area as a simple heuristic.
  let best = null
  for (const img of imgs) {
    const w = img.naturalWidth || 0
    const h = img.naturalHeight || 0
    if (!w || !h) continue
    if (!best || w * h > best.w * best.h) best = { url: img.src, w, h }
  }
  return best?.url || null
}

function ensureButton() {
  if (document.getElementById('meetmap-importer-btn')) return

  // Only show on likely post pages.
  const p = window.location.pathname
  const looksLikePost = p.startsWith('/p/') || p.startsWith('/reel/') || p.startsWith('/tv/')
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
    const sourceUrl = window.location.href
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

    chrome.tabs.create({ url })
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

