/** Plain-language texts for pages that could not be loaded (Chromium net error codes) */

export interface LoadError {
  title: string
  text: string
  code: string
}

const CERT = 'The site could not prove that it is really the address you typed. Someone may be trying to read what you send, or the site has a setup problem. TCT Orbit stopped the connection.'

export function describeLoadError(errorCode: number, description: string, url: string): LoadError {
  let host = ''
  try {
    host = new URL(url).host
  } catch {}
  const site = host || 'The site'
  const code = description || `Error ${errorCode}`
  const e = (title: string, text: string): LoadError => ({ title, text, code })

  if (errorCode <= -200 && errorCode > -300) return e('Your connection is not private', CERT)
  switch (errorCode) {
    case -20:
      return e('This page is blocked', 'It is on your Focus Sprint list, or TCT Orbit stopped it.')
    case -105:
    case -137:
      return e('This site can’t be found', `There is no site at ${site}. Check the address for typing mistakes.`)
    case -106:
      return e('You are offline', 'Connect to the internet. The page loads by itself when you are back online.')
    case -102:
      return e('The site refused to connect', `${site} is not accepting connections right now.`)
    case -7:
    case -118:
      return e('The site took too long', `${site} did not answer in time. Try again in a moment.`)
    case -100:
    case -101:
    case -324:
      return e('The site closed the connection', `${site} ended the connection without sending the page.`)
    case -21:
    case -109:
    case -104:
      return e('The site can’t be reached', `Check your internet connection, or try again: ${site} could not be reached.`)
    case -130:
    case -111:
    case -120:
      return e('The proxy is not working', 'Check the proxy or Tor settings in Settings → Privacy & Shield.')
    case -107:
    case -113:
      return e('A secure connection is not possible', `${site} uses security settings that are not supported.`)
    case -310:
      return e('Too many redirects', `${site} keeps redirecting. Deleting its cookies may help.`)
    case -6:
      return e('File not found', 'It may have been moved or deleted.')
    default:
      return e('Unable to reach webpage', 'Check your internet connection or the address, then try again.')
  }
}
