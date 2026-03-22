/**
 * Safe diagnostics for R2 + presign setup (no secrets exposed).
 * Open: GET https://your-deployment.vercel.app/api/storage-health
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const viteR2 = process.env.VITE_USE_R2_STORAGE
  const r2Ready = !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_BASE_URL
  )
  const supabaseForPresign = !!(
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
    (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  )

  res.status(200).json({
    r2ServerCredentialsComplete: r2Ready,
    supabaseKeysForPresignJwt: supabaseForPresign,
    viteUseR2Storage_runtimeString: viteR2 === undefined ? '(undefined)' : String(viteR2),
    note:
      'Uploads use R2 only if the *built* JS has VITE_USE_R2_STORAGE truthy (set in Vercel, then Production redeploy). This endpoint shows server env; if vite flag is undefined here, add VITE_USE_R2_STORAGE for Production and redeploy.',
  })
}
