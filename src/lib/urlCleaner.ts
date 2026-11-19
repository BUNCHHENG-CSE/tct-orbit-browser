/**
 * URL Sanitizer & Tracking Parameter Stripper
 * Removes telemetry, campaign trackers, click IDs, and surveillance query arguments.
 */

export const TRACKING_PARAMS = new Set([
  // Google Analytics & Campaigns
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_name',
  'utm_reader',
  'utm_referrer',
  'utm_brand',
  'utm_social-type',

  // Facebook & Instagram
  'fbclid',
  'fbadid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  'fb_ref',
  'igshid',
  'igsh',

  // Google Ads & Marketing
  'gclid',
  'gclsrc',
  'dclid',
  'gad_source',
  'gbraid',
  'wbraid',

  // Microsoft Bing
  'msclkid',

  // Twitter / X
  'twclid',
  'ref_src',
  'ref_url',

  // YouTube / Media tracking (preserves 'v' and 't')
  'si',
  'feature',
  'pp',

  // TikTok
  '_r',
  '_t',
  'tt_medium',
  'tt_content',

  // Mailchimp & HubSpot
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'hsCtsTracking',

  // General Ad & Affiliate Trackers
  'yclid',
  'wickedid',
  'aff_id',
  'aff_sub',
  'affiliate_id',
  'spm',
  'scm',
  'ref',
  'referrer',
  '_openstat',
  'zanpid'
])

/**
 * Strips all known tracking query parameters from a URL while preserving functional arguments.
 */
export function cleanUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl
  const trimmed = rawUrl.trim()
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const paramsToDelete: string[] = []

    url.searchParams.forEach((_value, key) => {
      const lowerKey = key.toLowerCase()
      if (TRACKING_PARAMS.has(lowerKey) || lowerKey.startsWith('utm_')) {
        paramsToDelete.push(key)
      }
    })

    paramsToDelete.forEach((key) => url.searchParams.delete(key))

    return url.toString()
  } catch {
    return trimmed
  }
}

/**
 * Checks whether a URL contains any tracking parameters.
 */
export function hasTrackingParams(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false
  try {
    const url = new URL(rawUrl)
    for (const key of url.searchParams.keys()) {
      const lower = key.toLowerCase()
      if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) {
        return true
      }
    }
  } catch {}
  return false
}
