const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0

const isValidLatLng = (lat, lng) =>
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))

const getTagCount = (tags) => {
  if (Array.isArray(tags)) return tags.filter(t => isNonEmptyString(t)).length
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean).length
  return 0
}

export const getEventQuality = (event) => {
  const hasPhoto = isNonEmptyString(event?.photo_url)
  const hasAddress = isNonEmptyString(event?.address) || isValidLatLng(event?.lat, event?.lng)
  const descLen = isNonEmptyString(event?.description) ? event.description.trim().length : 0
  const hasDescription = descLen >= 20
  const hasHost = isNonEmptyString(event?.host)
  const tagCount = getTagCount(event?.tags)

  let score = 0
  score += hasPhoto ? 30 : 0
  score += hasAddress ? 30 : 0
  score += hasDescription ? 20 : 0
  score += hasHost ? 10 : 0
  score += tagCount > 0 ? 10 : 0

  if (score >= 80) {
    return { score, label: 'Verified Details', fg: '#7CFF6B', bg: '#7CFF6B22', short: 'VERIFIED' }
  }
  if (score >= 50) {
    return { score, label: 'Good Details', fg: '#FFD700', bg: '#FFD70022', short: 'GOOD' }
  }
  return { score, label: 'Needs Details', fg: '#FF6060', bg: '#FF353522', short: 'NEEDS INFO' }
}

