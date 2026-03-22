/**
 * Resize + re-encode images before upload to cut Supabase Storage egress (cached bandwidth).
 * Flyers/photos from phones are often 3–12MB; list views re-fetch them constantly.
 */
const DEFAULT_MAX_WIDTH = 1280
const DEFAULT_QUALITY = 0.82
const SKIP_IF_SMALLER_THAN = 180 * 1024 // bytes — already light enough

export async function compressImageForUpload(file, options = {}) {
  if (!file || typeof file !== 'object') return file
  const type = file.type || ''
  if (!type.startsWith('image/')) return file
  // Skip formats canvas may mishandle
  if (type === 'image/svg+xml' || type === 'image/gif') return file
  if (file.size > 0 && file.size < SKIP_IF_SMALLER_THAN) return file

  const maxWidth = options.maxWidth ?? DEFAULT_MAX_WIDTH
  const quality = options.quality ?? DEFAULT_QUALITY

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }

  let { width, height } = bitmap
  if (width < 1 || height < 1) {
    bitmap.close?.()
    return file
  }

  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width)
    width = maxWidth
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    return file
  }
  // JPEG has no alpha — white base so PNG flyers don’t get black bars
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  })
  if (!blob) return file
  // Don't replace if compression didn't help
  if (blob.size >= file.size * 0.95) return file

  const base = String(file.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${base}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}
